// The tenant-isolation suite (README 5.1.6, `npm run test:tenancy`). Two garages, A and B,
// each with an owner, a second branch and a staff member. For every garage endpoint,
// garage A's owner tries to read, change or use garage B's data and must fail, while B's
// rows stay unchanged. RLS itself is proven in packages/database/test/rls.test.ts.
//
// The last test lists every /v1 route the app really serves: a new endpoint without a
// case below (or a reason in NO_TENANT_DATA) fails the suite, so it cannot be forgotten.
import { randomUUID } from 'node:crypto';
import { type INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { PlatformDb } from '../src/common/db/platform-db';
import { createTestApp } from './helpers/app';
import {
  type TestStaffGarage,
  createGarageWithOwner,
  randomPhone,
  staffLogin,
} from './helpers/staff';

/** Routes that carry no tenant data: the token or session alone decides who is acting. */
const NO_TENANT_DATA: Record<string, string> = {
  'POST /v1/auth/login': 'email + password; the user row decides the garage',
  'POST /v1/auth/set-password': 'the one-time link token decides the user',
  'POST /v1/auth/refresh': 'the refresh token decides the session',
  'POST /v1/auth/logout': 'revokes only the presented refresh token',
};

interface Side {
  garage: TestStaffGarage;
  cookie: string;
  branchId: string;
  memberId: string;
  customerId: string;
  phone: string;
  vehicleId: string;
  plate: string;
  make: string;
  openVisitId: string;
  overrideTypeId: string;
}

describe('Tenant isolation (test:tenancy)', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let a: Side;
  let b: Side;
  /** The global OIL_CHANGE service type (seeded by test:prepare). */
  let oilChangeId: string;

  const http = () => request(app.getHttpServer());
  const asA = {
    get: (url: string) => http().get(url).set('Cookie', a.cookie),
    post: (url: string, body?: object) => http().post(url).set('Cookie', a.cookie).send(body),
    patch: (url: string, body: object) => http().patch(url).set('Cookie', a.cookie).send(body),
  };
  const uniqueEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@test.local`;

  /**
   * A garage with an owner session, a second branch, an invited manager, and a customer
   * with one car (its make is unique, so it is also a suggestion only this garage has).
   */
  async function createSide(): Promise<Side> {
    const garage = await createGarageWithOwner(app);
    const { cookie } = await staffLogin(app, garage.ownerEmail, garage.password);
    const as = (url: string, body: object) => http().post(url).set('Cookie', cookie).send(body);
    const branch = (await as('/v1/branches', { name: 'Second' }).expect(201)).body;
    const member = (
      await as('/v1/users', {
        name: 'Member',
        email: uniqueEmail('member'),
        role: 'MANAGER',
        branchId: branch.id,
        locale: 'en',
      }).expect(201)
    ).body;
    const phone = randomPhone();
    const customer = (await as('/v1/customers', { name: 'Customer', phone }).expect(201)).body;
    const plate = `P${randomUUID().slice(0, 6).toUpperCase()}`;
    const make = `Make${randomUUID().slice(0, 6)}`;
    const vehicle = (
      await as(`/v1/customers/${customer.id}/vehicles`, {
        plate,
        make,
        model: 'Model',
        distanceUnit: 'KM',
        odometer: 1000,
      }).expect(201)
    ).body;
    // An open visit with one oil change, and the garage's own oil-change override.
    const visit = (await as('/v1/visits', { vehicleId: vehicle.id, odometer: 1200 }).expect(201))
      .body;
    await as(`/v1/visits/${visit.id}/records`, {
      services: [{ serviceTypeId: oilChangeId, unitPriceCents: 2500 }],
    }).expect(201);
    const override = await platform.serviceType.create({
      data: {
        garageId: garage.garageId,
        code: 'OIL_CHANGE',
        nameEn: 'Oil change (own)',
        nameAr: 'تغيير زيت',
        defaultIntervalKm: 7000,
        defaultIntervalMonths: 9,
      },
    });
    return {
      garage,
      cookie,
      branchId: branch.id,
      memberId: member.id,
      customerId: customer.id,
      phone,
      vehicleId: vehicle.id,
      plate,
      make,
      openVisitId: visit.id,
      overrideTypeId: override.id,
    };
  }

  /** B's rows as stored, to prove an attempt changed nothing. */
  async function snapshotB() {
    const garageId = b.garage.garageId;
    const byId = { orderBy: { id: 'asc' as const } };
    const where = { where: { garageId }, ...byId };
    const rows = await Promise.all([
      platform.garage.findUniqueOrThrow({ where: { id: garageId } }),
      platform.branch.findMany(where),
      platform.user.findMany(where),
      platform.notification.count({ where: { garageId } }),
      platform.garageCustomer.findMany(where),
      platform.vehicle.findMany(where),
      platform.suggestion.findMany(where),
      platform.visit.findMany(where),
      platform.serviceRecord.findMany(where),
      platform.reminder.findMany(where),
      platform.serviceType.findMany(where),
    ]);
    const [garage, branches, users, notifications, customers, vehicles, suggestions] = rows;
    const [visits, records, reminders, serviceTypes] = rows.slice(7);
    return {
      garage,
      branches,
      users,
      notifications,
      customers,
      vehicles,
      suggestions,
      visits,
      records,
      reminders,
      serviceTypes,
    };
  }

  /** Runs `attempt`, then checks that none of garage B's rows changed. */
  async function expectBUnchanged(attempt: () => Promise<unknown>) {
    const before = await snapshotB();
    await attempt();
    expect(await snapshotB()).toEqual(before);
  }

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    oilChangeId = (
      await platform.serviceType.findFirstOrThrow({ where: { garageId: null, code: 'OIL_CHANGE' } })
    ).id;
    a = await createSide();
    b = await createSide();
  });

  afterAll(async () => {
    await app?.close();
  });

  // One entry per garage endpoint; the coverage test below checks the keys. They run in
  // this order, so each list check comes before the create that adds a row.
  const cases: Record<string, () => Promise<void>> = {
    'GET /v1/auth/me': async () => {
      const me = await asA.get('/v1/auth/me').expect(200);
      expect(me.body.garage.id).toBe(a.garage.garageId);
    },

    'GET /v1/branches': async () => {
      const res = await asA.get('/v1/branches?pageSize=50').expect(200);
      const ids = res.body.items.map((x: { id: string }) => x.id);
      expect(ids.sort()).toEqual([a.garage.branchId, a.branchId].sort());
      expect(res.body.total).toBe(2);
    },

    'POST /v1/branches': async () => {
      await expectBUnchanged(async () => {
        // A garageId in the body is ignored: the branch lands in A (README 5.1.5).
        const created = await asA
          .post('/v1/branches', { name: 'Third', garageId: b.garage.garageId })
          .expect(201);
        const row = await platform.branch.findUniqueOrThrow({ where: { id: created.body.id } });
        expect(row.garageId).toBe(a.garage.garageId);
      });
    },

    'PATCH /v1/branches/:branchId': async () => {
      await expectBUnchanged(async () => {
        await asA.patch(`/v1/branches/${b.branchId}`, { name: 'Hacked' }).expect(404);
        await asA.patch(`/v1/branches/${b.branchId}`, { isActive: false }).expect(404);
        await asA.patch(`/v1/branches/${b.garage.branchId}`, { name: 'Hacked' }).expect(404);
      });
    },

    'GET /v1/users': async () => {
      const res = await asA.get('/v1/users?pageSize=50').expect(200);
      const ids = res.body.items.map((x: { id: string }) => x.id);
      expect(ids.sort()).toEqual([a.garage.ownerId, a.memberId].sort());
      expect(res.body.total).toBe(2);
    },

    'POST /v1/users': async () => {
      await expectBUnchanged(async () => {
        // B's branch cannot be used to place someone, in A or anywhere.
        await asA
          .post('/v1/users', {
            name: 'Sneaky',
            email: uniqueEmail('sneaky'),
            role: 'MECHANIC',
            branchId: b.branchId,
            locale: 'en',
          })
          .expect(404);
        // A garageId in the body is ignored: the member lands in A.
        const created = await asA
          .post('/v1/users', {
            name: 'Placed',
            email: uniqueEmail('placed'),
            role: 'MANAGER',
            branchId: null,
            locale: 'en',
            garageId: b.garage.garageId,
          })
          .expect(201);
        const row = await platform.user.findUniqueOrThrow({ where: { id: created.body.id } });
        expect(row.garageId).toBe(a.garage.garageId);
      });
    },

    'PATCH /v1/users/:userId': async () => {
      await expectBUnchanged(async () => {
        await asA.patch(`/v1/users/${b.memberId}`, { name: 'Hacked' }).expect(404);
        await asA.patch(`/v1/users/${b.memberId}`, { isActive: false }).expect(404);
        // B's owner gets the same 404 as any unknown id (not "owner cannot be changed").
        await asA.patch(`/v1/users/${b.garage.ownerId}`, { name: 'Hacked' }).expect(404);
        // A's own member cannot be moved into B's branch.
        await asA.patch(`/v1/users/${a.memberId}`, { branchId: b.branchId }).expect(404);
      });
    },

    'POST /v1/users/:userId/invite': async () => {
      await expectBUnchanged(async () => {
        await asA.post(`/v1/users/${b.memberId}/invite`).expect(404);
      });
    },

    'POST /v1/users/:userId/password-reset': async () => {
      await expectBUnchanged(async () => {
        await asA.post(`/v1/users/${b.memberId}/password-reset`).expect(404);
        await asA.post(`/v1/users/${b.garage.ownerId}/password-reset`).expect(404);
      });
    },

    // Step 2.3: customers, vehicles, search, suggestions.

    'GET /v1/search': async () => {
      // B's plate and B's customer phone (local and international form) find nothing in A.
      for (const q of [b.plate, b.phone, `0${b.phone.slice(4)}`, b.phone.slice(-6)]) {
        const res = await asA.get(`/v1/search?q=${encodeURIComponent(q)}`).expect(200);
        expect(res.body.total).toBe(0);
      }
      // A finds its own car, so the search itself works.
      const own = await asA.get(`/v1/search?q=${a.plate}`).expect(200);
      expect(own.body.items.map((r: { vehicle: { id: string } }) => r.vehicle.id)).toEqual([
        a.vehicleId,
      ]);
    },

    'GET /v1/suggestions': async () => {
      const theirs = await asA
        .get(`/v1/suggestions?field=VEHICLE_MAKE&q=${encodeURIComponent(b.make)}`)
        .expect(200);
      expect(theirs.body.items).toEqual([]);
      const all = await asA.get('/v1/suggestions?field=VEHICLE_MAKE').expect(200);
      expect(all.body.items.map((x: { value: string }) => x.value)).toEqual([a.make]);
    },

    'GET /v1/customers': async () => {
      const all = await asA.get('/v1/customers?pageSize=50').expect(200);
      expect(all.body.items.map((c: { id: string }) => c.id)).toEqual([a.customerId]);
      expect(all.body.total).toBe(1);
      // Filtering by B's customer's phone or name finds nothing in A.
      for (const q of [b.phone.slice(-6), 'Customer']) {
        const res = await asA.get(`/v1/customers?q=${encodeURIComponent(q)}`).expect(200);
        expect(res.body.items.map((c: { id: string }) => c.id)).not.toContain(b.customerId);
      }
    },

    'GET /v1/customers/:customerId': async () => {
      await asA.get(`/v1/customers/${b.customerId}`).expect(404);
    },

    'PATCH /v1/customers/:customerId': async () => {
      await expectBUnchanged(async () => {
        await asA.patch(`/v1/customers/${b.customerId}`, { name: 'Hacked' }).expect(404);
        await asA.patch(`/v1/customers/${b.customerId}`, { remindersOptOut: true }).expect(404);
      });
    },

    'POST /v1/customers/:customerId/vehicles': async () => {
      await expectBUnchanged(async () => {
        const car = { plate: 'X 1', make: 'Kia', model: 'Rio', distanceUnit: 'KM', odometer: 1 };
        await asA.post(`/v1/customers/${b.customerId}/vehicles`, car).expect(404);
        // B's plate is free in A (plates are unique per garage, flow.md 13).
        const same = await asA
          .post(`/v1/customers/${a.customerId}/vehicles`, { ...car, plate: b.plate })
          .expect(201);
        const row = await platform.vehicle.findUniqueOrThrow({ where: { id: same.body.id } });
        expect(row.garageId).toBe(a.garage.garageId);
      });
    },

    'GET /v1/vehicles/:vehicleId': async () => {
      await asA.get(`/v1/vehicles/${b.vehicleId}`).expect(404);
    },

    'PATCH /v1/vehicles/:vehicleId': async () => {
      await expectBUnchanged(async () => {
        await asA.patch(`/v1/vehicles/${b.vehicleId}`, { make: 'Hacked' }).expect(404);
        await asA.patch(`/v1/vehicles/${b.vehicleId}`, { plate: 'HACKED' }).expect(404);
      });
    },

    // Step 2.4: service types, quick entry, visits, history.

    'GET /v1/service-types': async () => {
      const res = await asA.get('/v1/service-types').expect(200);
      const ids = res.body.map((t: { id: string }) => t.id);
      expect(ids).toContain(a.overrideTypeId);
      expect(ids).not.toContain(b.overrideTypeId);
      // A sees its own oil change override (7000 km), never B's.
      const oil = res.body.find((t: { code: string }) => t.code === 'OIL_CHANGE');
      expect(oil.id).toBe(a.overrideTypeId);
    },

    'GET /v1/vehicles/:vehicleId/prefill': async () => {
      await asA.get(`/v1/vehicles/${b.vehicleId}/prefill?serviceTypeId=${oilChangeId}`).expect(404);
      // B's own service type cannot be used either.
      await asA
        .get(`/v1/vehicles/${a.vehicleId}/prefill?serviceTypeId=${b.overrideTypeId}`)
        .expect(404);
      // A's car, with the global type: A's override applies, and "last used" is A's own.
      const own = await asA
        .get(`/v1/vehicles/${a.vehicleId}/prefill?serviceTypeId=${oilChangeId}`)
        .expect(200);
      expect(own.body.serviceType.id).toBe(a.overrideTypeId);
      expect(own.body.last.unitPriceCents).toBe(2500);
    },

    'GET /v1/vehicles/:vehicleId/history': async () => {
      await asA.get(`/v1/vehicles/${b.vehicleId}/history`).expect(404);
    },

    'POST /v1/visits/quick': async () => {
      await expectBUnchanged(async () => {
        const oil = [{ serviceTypeId: oilChangeId }];
        await asA
          .post('/v1/visits/quick', { vehicleId: b.vehicleId, odometer: 5000, services: oil })
          .expect(404);
        // A's car, but B's service type or B's branch: refused.
        await asA
          .post('/v1/visits/quick', {
            vehicleId: a.vehicleId,
            odometer: 1300,
            services: [{ serviceTypeId: b.overrideTypeId }],
          })
          .expect(404);
        await asA
          .post('/v1/visits/quick', {
            vehicleId: a.vehicleId,
            odometer: 1300,
            branchId: b.branchId,
            services: oil,
          })
          .expect(404);
      });
    },

    'POST /v1/visits': async () => {
      await expectBUnchanged(async () => {
        await asA.post('/v1/visits', { vehicleId: b.vehicleId, odometer: 5000 }).expect(404);
      });
    },

    'GET /v1/visits/:visitId': async () => {
      await asA.get(`/v1/visits/${b.openVisitId}`).expect(404);
    },

    'POST /v1/visits/:visitId/records': async () => {
      await expectBUnchanged(async () => {
        await asA
          .post(`/v1/visits/${b.openVisitId}/records`, {
            services: [{ serviceTypeId: oilChangeId }],
          })
          .expect(404);
        // A's open visit cannot receive B's service type.
        await asA
          .post(`/v1/visits/${a.openVisitId}/records`, {
            services: [{ serviceTypeId: b.overrideTypeId }],
          })
          .expect(404);
      });
    },

    'PATCH /v1/visits/:visitId': async () => {
      await expectBUnchanged(async () => {
        await asA.patch(`/v1/visits/${b.openVisitId}`, { status: 'WAITING_FOR_PARTS' }).expect(404);
      });
    },

    'POST /v1/visits/:visitId/finish': async () => {
      await expectBUnchanged(async () => {
        await asA.post(`/v1/visits/${b.openVisitId}/finish`).expect(404);
      });
    },

    // Last: it links B's customer's owner to A, which is allowed (same phone at two
    // garages, flow.md 3.1) but must reveal nothing of B.
    'POST /v1/customers': async () => {
      await expectBUnchanged(async () => {
        const res = await asA
          .post('/v1/customers', {
            name: 'A name',
            phone: b.phone,
            garageId: b.garage.garageId,
          })
          .expect(201);
        // A new customer of A: A's own name, none of B's cars, stored in A.
        expect(res.body).toMatchObject({ created: true, name: 'A name', vehicles: [] });
        const row = await platform.garageCustomer.findUniqueOrThrow({
          where: { id: res.body.id },
        });
        expect(row.garageId).toBe(a.garage.garageId);
      });
      // B's car is still invisible to A, even now that both garages know the phone.
      const search = await asA.get(`/v1/search?q=${encodeURIComponent(b.phone)}`).expect(200);
      expect(search.body.items).toEqual([
        { customer: expect.objectContaining({ name: 'A name' }), vehicle: null },
      ]);
    },
  };

  for (const [route, run] of Object.entries(cases)) {
    it(`${route}: garage A cannot reach garage B`, run);
  }

  it('every /v1 route has a case above or a reason in NO_TENANT_DATA', () => {
    const served = staffRoutes(app);
    const covered = [...Object.keys(cases), ...Object.keys(NO_TENANT_DATA)].sort();
    expect(served).toEqual(covered);
  });
});

/** "METHOD /path" for every route of every controller under /v1, from Nest's metadata. */
function staffRoutes(app: INestApplication): string[] {
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
        if (path.startsWith('v1/')) routes.push(`${RequestMethod[method]} /${path}`);
      }
    }
  }
  return routes.sort();
}
