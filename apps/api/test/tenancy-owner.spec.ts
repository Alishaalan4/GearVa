// The owner app's isolation suite (README 6, Phase 6 "Done when"; run by test:tenancy).
// Owner X is a customer of garages A and B; owner Y of garages A and C. For every
// /mobile/v1 endpoint, X tries to read or change what is Y's (or a garage X is not a
// customer of) and must fail, while Y's rows stay unchanged. The owner_* RLS policies
// themselves are proven in packages/database/test/rls.test.ts.
//
// The last test lists every /mobile/v1 route the app serves: a new one without a case
// (or a reason in NO_OWNER_DATA) fails the suite.
import { type INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { PlatformDb } from '../src/common/db/platform-db';
import { createTestApp } from './helpers/app';
import { type TestOwner, addCustomer, createOwnerAccount, ownerLogin } from './helpers/owners';
import { type TestStaffGarage, createGarageWithOwner, staffLogin } from './helpers/staff';

/** Routes where the body or the session alone decides whose account is touched. */
const NO_OWNER_DATA: Record<string, string> = {
  'POST /mobile/v1/auth/set-password': 'the one-time link token decides the owner',
  'POST /mobile/v1/auth/login': 'email + password decide the owner',
  'POST /mobile/v1/auth/refresh': 'the refresh token decides the session',
  'POST /mobile/v1/auth/logout': 'revokes only the presented refresh token',
  'POST /mobile/v1/auth/forgot-password': 'always 202; emails only the account of that email',
};

interface Garage {
  g: TestStaffGarage;
  cookie: string;
}

describe('Owner isolation (test:tenancy)', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let a: Garage;
  let b: Garage;
  let c: Garage;
  let x: TestOwner;
  let y: TestOwner;
  let xToken: string;
  /** X's and Y's car and invoice at garage A, where both are customers. */
  let xCarId: string;
  let xInvoiceId: string;
  let yCarId: string;
  let yInvoiceId: string;

  let yNotificationId: string;
  let cOfferId: string;
  let aOfferId: string;
  const yDeviceToken = `fcm-y-${Date.now()}`;

  /** The start of a PNG: enough for the logo type check. */
  const PNG = Buffer.from('89504e470d0a1a0a0000', 'hex');

  /** A car with one finished oil change at garage A; returns the car and invoice ids. */
  async function carWithInvoice(customerId: string, plate: string) {
    const oil = await platform.serviceType.findFirstOrThrow({
      where: { garageId: null, code: 'OIL_CHANGE' },
    });
    const as = (url: string, body: object) => http().post(url).set('Cookie', a.cookie).send(body);
    const car = await as(`/v1/customers/${customerId}/vehicles`, {
      plate,
      make: 'Kia',
      model: 'Rio',
      distanceUnit: 'KM',
      odometer: 1000,
    }).expect(201);
    const visit = await as('/v1/visits/quick', {
      vehicleId: car.body.id,
      odometer: 1100,
      services: [{ serviceTypeId: oil.id, unitPriceCents: 2500 }],
    }).expect(201);
    return { carId: car.body.id as string, invoiceId: visit.body.invoice.id as string };
  }

  const http = () => request(app.getHttpServer());
  const asX = {
    get: (url: string) => http().get(url).set('Authorization', `Bearer ${xToken}`),
    patch: (url: string, body: object) =>
      http().patch(url).set('Authorization', `Bearer ${xToken}`).send(body),
    post: (url: string, body: object) =>
      http().post(url).set('Authorization', `Bearer ${xToken}`).send(body),
    delete: (url: string, body: object) =>
      http().delete(url).set('Authorization', `Bearer ${xToken}`).send(body),
  };

  async function garage(): Promise<Garage> {
    const g = await createGarageWithOwner(app);
    return { g, cookie: (await staffLogin(app, g.ownerEmail, g.password)).cookie };
  }

  /** Y's account and customer rows, to prove an attempt changed nothing. */
  async function snapshotY() {
    return {
      owner: await platform.owner.findUniqueOrThrow({ where: { id: y.ownerId } }),
      customers: await platform.garageCustomer.findMany({
        where: { ownerId: y.ownerId },
        orderBy: { id: 'asc' },
      }),
      sessions: await platform.session.findMany({
        where: { subjectType: 'OWNER', subjectId: y.ownerId },
        orderBy: { id: 'asc' },
      }),
      notifications: await platform.notification.findMany({
        where: { ownerId: y.ownerId },
        orderBy: { id: 'asc' },
      }),
      devices: await platform.deviceToken.findMany({
        where: { ownerId: y.ownerId },
        orderBy: { id: 'asc' },
      }),
      offerViews: await platform.offerView.findMany({
        where: { ownerId: y.ownerId },
        orderBy: { id: 'asc' },
      }),
    };
  }

  async function expectYUnchanged(attempt: () => Promise<unknown>) {
    const before = await snapshotY();
    await attempt();
    expect(await snapshotY()).toEqual(before);
  }

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    a = await garage();
    b = await garage();
    c = await garage();
    x = await createOwnerAccount(app, a.cookie);
    await addCustomer(app, b.cookie, x.phone);
    y = await createOwnerAccount(app, c.cookie);
    const yAtA = await addCustomer(app, a.cookie, y.phone);
    ({ carId: xCarId, invoiceId: xInvoiceId } = await carWithInvoice(x.customerId, 'X 1'));
    ({ carId: yCarId, invoiceId: yInvoiceId } = await carWithInvoice(yAtA, 'Y 1'));
    // C, Y's garage only, has a logo.
    await http()
      .post('/v1/invoice-settings/logo')
      .set('Cookie', c.cookie)
      .attach('file', PNG, 'logo.png')
      .expect(200);
    // Step 6.4: an unread inbox entry and a phone for Y, both at garage A (shared with X).
    yNotificationId = (
      await platform.notification.create({
        data: {
          garageId: a.g.garageId,
          ownerId: y.ownerId,
          channel: 'IN_APP',
          type: 'SERVICE_REMINDER',
          template: 'service-reminder',
          locale: 'en',
          recipient: y.ownerId,
          payload: {},
          status: 'SENT',
          dedupeKey: `TEST:${y.ownerId}`,
        },
      })
    ).id;
    await platform.deviceToken.create({
      data: { ownerId: y.ownerId, token: yDeviceToken, platform: 'android' },
    });
    // Step 6.5: an offer with an image at C (Y's garage only) and one at A (both).
    const newOffer = async (cookie: string, title: string) => {
      const id = (
        await http()
          .post('/v1/offers')
          .set('Cookie', cookie)
          .send({ title, discountType: 'PERCENT', discountValue: 10 })
          .expect(201)
      ).body.id as string;
      await http()
        .post(`/v1/offers/${id}/image`)
        .set('Cookie', cookie)
        .attach('file', PNG, 'offer.png')
        .expect(200);
      return id;
    };
    cOfferId = await newOffer(c.cookie, 'C offer');
    aOfferId = await newOffer(a.cookie, 'A offer');
    await ownerLogin(app, y.email);
    xToken = (await ownerLogin(app, x.email)).accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  const cases: Record<string, () => Promise<void>> = {
    'GET /mobile/v1/me': async () => {
      const me = await asX.get('/mobile/v1/me').expect(200);
      expect(me.body.id).toBe(x.ownerId);
      // A and B, never C (Y's garage), even though Y is also a customer of A.
      expect(me.body.garages.map((r: { id: string }) => r.id).sort()).toEqual(
        [a.g.garageId, b.g.garageId].sort(),
      );
    },

    // Step 6.3: cars, history, invoices, PDFs, logos.
    'GET /mobile/v1/vehicles': async () => {
      const res = await asX.get('/mobile/v1/vehicles').expect(200);
      // Only X's car, although Y has one at the same garage.
      expect(res.body.map((v: { id: string }) => v.id)).toEqual([xCarId]);
    },

    'GET /mobile/v1/vehicles/:vehicleId': async () => {
      await asX.get(`/mobile/v1/vehicles/${yCarId}`).expect(404);
    },

    'GET /mobile/v1/vehicles/:vehicleId/visits': async () => {
      await asX.get(`/mobile/v1/vehicles/${yCarId}/visits`).expect(404);
      const own = await asX.get(`/mobile/v1/vehicles/${xCarId}/visits`).expect(200);
      expect(own.body.total).toBe(1);
    },

    'GET /mobile/v1/invoices': async () => {
      const res = await asX.get('/mobile/v1/invoices?pageSize=50').expect(200);
      expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([xInvoiceId]);
      expect(res.body.total).toBe(1);
    },

    'GET /mobile/v1/invoices/:invoiceId': async () => {
      await asX.get(`/mobile/v1/invoices/${yInvoiceId}`).expect(404);
    },

    'GET /mobile/v1/invoices/:invoiceId/pdf': async () => {
      await asX.get(`/mobile/v1/invoices/${yInvoiceId}/pdf`).expect(404);
    },

    'GET /mobile/v1/garages/:garageId/logo': async () => {
      // C has a logo, but X is not its customer.
      await asX.get(`/mobile/v1/garages/${c.g.garageId}/logo`).expect(404);
    },

    // Step 6.5: offers.
    'GET /mobile/v1/offers': async () => {
      const res = await asX.get('/mobile/v1/offers').expect(200);
      const ids = res.body.map((o: { id: string }) => o.id);
      // A's offer (X is A's customer), never C's (only Y is C's customer).
      expect(ids).toContain(aOfferId);
      expect(ids).not.toContain(cOfferId);
    },

    'GET /mobile/v1/offers/:offerId/image': async () => {
      await asX.get(`/mobile/v1/offers/${cOfferId}/image`).expect(404);
    },

    'POST /mobile/v1/offers/:offerId/viewed': async () => {
      await expectYUnchanged(async () => {
        await asX.post(`/mobile/v1/offers/${cOfferId}/viewed`, {}).expect(404);
        // X's view of A's offer is X's alone.
        await asX.post(`/mobile/v1/offers/${aOfferId}/viewed`, {}).expect(204);
      });
      const views = await platform.offerView.findMany({ where: { offerId: aOfferId } });
      expect(views.map((v) => v.ownerId)).toEqual([x.ownerId]);
    },

    // Step 6.4: inbox and devices.
    'GET /mobile/v1/notifications': async () => {
      const res = await asX.get('/mobile/v1/notifications?pageSize=50').expect(200);
      expect(res.body.items.map((n: { id: string }) => n.id)).not.toContain(yNotificationId);
      expect(res.body.total).toBe(0);
    },

    'POST /mobile/v1/notifications/:notificationId/read': async () => {
      await expectYUnchanged(async () => {
        await asX.post(`/mobile/v1/notifications/${yNotificationId}/read`, {}).expect(404);
      });
    },

    'POST /mobile/v1/notifications/read-all': async () => {
      await expectYUnchanged(async () => {
        await asX.post('/mobile/v1/notifications/read-all', {}).expect(204);
      });
    },

    'POST /mobile/v1/devices': async () => {
      await expectYUnchanged(async () => {
        // An ownerId in the body is ignored: the token is X's.
        await asX
          .post('/mobile/v1/devices', {
            token: `fcm-x-${Date.now()}`,
            platform: 'ios',
            ownerId: y.ownerId,
          })
          .expect(204);
      });
    },

    'DELETE /mobile/v1/devices/:token': async () => {
      await expectYUnchanged(async () => {
        await asX.delete(`/mobile/v1/devices/${yDeviceToken}`, {}).expect(204);
      });
    },

    'PATCH /mobile/v1/me': async () => {
      await expectYUnchanged(async () => {
        // An id or email in the body is ignored: only X's row changes.
        await asX
          .patch('/mobile/v1/me', { locale: 'ar', id: y.ownerId, email: y.email })
          .expect(200);
      });
      const row = await platform.owner.findUniqueOrThrow({ where: { id: x.ownerId } });
      expect(row).toMatchObject({ locale: 'ar', email: x.email });
    },

    'PATCH /mobile/v1/garages/:garageId/preferences': async () => {
      await expectYUnchanged(async () => {
        // C: X is not its customer.
        await asX
          .patch(`/mobile/v1/garages/${c.g.garageId}/preferences`, { marketingOptOut: true })
          .expect(404);
        // A: both are customers; only X's row changes.
        await asX
          .patch(`/mobile/v1/garages/${a.g.garageId}/preferences`, { remindersOptOut: true })
          .expect(200);
      });
      const xAtA = await platform.garageCustomer.findFirstOrThrow({
        where: { ownerId: x.ownerId, garageId: a.g.garageId },
      });
      expect(xAtA.remindersOptOut).toBe(true);
    },

    'POST /mobile/v1/me/password': async () => {
      await expectYUnchanged(async () => {
        // Y's password is not X's current password.
        await asX
          .post('/mobile/v1/me/password', {
            currentPassword: 'not my password 1',
            newPassword: 'another password 1',
          })
          .expect(401);
      });
    },

    'DELETE /mobile/v1/me': async () => {
      // Last: it ends X's account. Y's account and rows stay as they were.
      await expectYUnchanged(async () => {
        await asX.delete('/mobile/v1/me', { password: 'owner app password 1' }).expect(204);
      });
      const row = await platform.owner.findUniqueOrThrow({ where: { id: x.ownerId } });
      expect(row.email).toBeNull();
    },
  };

  for (const [route, run] of Object.entries(cases)) {
    it(`${route}: owner X cannot reach what is not theirs`, run);
  }

  it('every /mobile/v1 route has a case above or a reason in NO_OWNER_DATA', () => {
    const covered = [...Object.keys(cases), ...Object.keys(NO_OWNER_DATA)].sort();
    expect(ownerRoutes(app)).toEqual(covered);
  });
});

/** "METHOD /path" for every route of every controller under /mobile/v1. */
function ownerRoutes(app: INestApplication): string[] {
  const trim = (p: unknown) => String(p ?? '').replace(/^\/+|\/+$/g, '');
  const routes: string[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const { metatype } of module.controllers.values()) {
      if (!metatype) continue;
      const base = trim(Reflect.getMetadata(PATH_METADATA, metatype));
      const proto = metatype.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (method === undefined) continue;
        const path = [base, trim(Reflect.getMetadata(PATH_METADATA, handler))]
          .filter(Boolean)
          .join('/');
        if (path.startsWith('mobile/v1/')) routes.push(`${RequestMethod[method]} /${path}`);
      }
    }
  }
  return routes.sort();
}
