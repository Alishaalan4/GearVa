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
    await addCustomer(app, a.cookie, y.phone);
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
