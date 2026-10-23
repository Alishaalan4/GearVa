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
import { type TestStaffGarage, createGarageWithOwner, staffLogin } from './helpers/staff';

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
}

describe('Tenant isolation (test:tenancy)', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let a: Side;
  let b: Side;

  const http = () => request(app.getHttpServer());
  const asA = {
    get: (url: string) => http().get(url).set('Cookie', a.cookie),
    post: (url: string, body?: object) => http().post(url).set('Cookie', a.cookie).send(body),
    patch: (url: string, body: object) => http().patch(url).set('Cookie', a.cookie).send(body),
  };
  const uniqueEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@test.local`;

  /** A garage with an owner session, a second branch and an invited manager. */
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
    return { garage, cookie, branchId: branch.id, memberId: member.id };
  }

  /** B's rows as stored, to prove an attempt changed nothing. */
  async function snapshotB() {
    const [garage, branches, users, notifications] = await Promise.all([
      platform.garage.findUniqueOrThrow({ where: { id: b.garage.garageId } }),
      platform.branch.findMany({ where: { garageId: b.garage.garageId }, orderBy: { id: 'asc' } }),
      platform.user.findMany({ where: { garageId: b.garage.garageId }, orderBy: { id: 'asc' } }),
      platform.notification.count({ where: { garageId: b.garage.garageId } }),
    ]);
    return { garage, branches, users, notifications };
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
