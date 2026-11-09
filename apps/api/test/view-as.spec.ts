// Step 5.5: "view as garage" (flow.md 11.3). An admin opens a garage's own app with a
// one-time code, reads as its owner, cannot change anything, and every step is logged.
import type { INestApplication } from '@nestjs/common';
import type { StaffProfile, ViewAsLink } from '@gearva/contracts';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { PlatformDb } from '../src/common/db/platform-db';
import { signInAsNewAdmin } from './helpers/admin';
import { cookiesOf, createTestApp } from './helpers/app';
import {
  type TestStaffGarage,
  createGarageWithOwner,
  randomPhone,
  staffLogin,
} from './helpers/staff';

describe('View as garage', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let admin: string;
  let adminId: string;
  let g: TestStaffGarage;
  let other: TestStaffGarage;
  let customerId: string;

  const http = () => request(app.getHttpServer());

  /** A fresh one-time code for this admin and garage. */
  async function issue(garageId = g.garageId): Promise<string> {
    const res = await http()
      .post(`/admin/v1/garages/${garageId}/view-as`)
      .set('Cookie', admin)
      .expect(200);
    const link = res.body as ViewAsLink;
    const url = new URL(link.url);
    expect(url.pathname).toBe('/view-as');
    return url.hash.slice(1);
  }

  /** Exchanges a code like garage-web does; returns the Cookie header of the session. */
  async function open(code: string): Promise<{ cookie: string; profile: StaffProfile }> {
    const res = await http().post('/v1/auth/view-as').send({ code }).expect(200);
    const c = cookiesOf(res);
    return { cookie: `gv_at=${c.gv_at}; gv_rt=${c.gv_rt}`, profile: res.body as StaffProfile };
  }

  const logs = (action: string) =>
    platform.adminAccessLog.findMany({
      where: { adminId, garageId: g.garageId, action },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    ({ adminId, cookie: admin } = await signInAsNewAdmin(app));
    g = await createGarageWithOwner(app);
    other = await createGarageWithOwner(app);
    const { cookie: owner } = await staffLogin(app, g.ownerEmail, g.password);
    customerId = (
      await http()
        .post('/v1/customers')
        .set('Cookie', owner)
        .send({ name: 'Viewed Customer', phone: randomPhone() })
        .expect(201)
    ).body.id as string;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('only a signed-in admin can ask for the link', async () => {
    await http().post(`/admin/v1/garages/${g.garageId}/view-as`).expect(401);
    const { cookie: owner } = await staffLogin(app, g.ownerEmail, g.password);
    await http().post(`/admin/v1/garages/${g.garageId}/view-as`).set('Cookie', owner).expect(401);
  });

  it('opens the garage as a read-only owner, and logs the start', async () => {
    const { cookie, profile } = await open(await issue());
    expect(profile).toMatchObject({
      id: adminId,
      role: 'OWNER',
      branchId: null,
      viewOnly: true,
      garage: { id: g.garageId },
    });
    const me = await http().get('/v1/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.viewOnly).toBe(true);
    expect((await logs('VIEW_AS_GARAGE_START')).length).toBeGreaterThanOrEqual(1);
    // The garage's own audit log has the start too, under the admin. (Its write failing
    // would only be logged, so this checks the row really exists.)
    expect(
      await platform.auditLog.count({
        where: {
          action: 'admin.view_as.start',
          garageId: g.garageId,
          actorType: 'ADMIN',
          actorId: adminId,
          entityId: adminId,
        },
      }),
    ).toBeGreaterThanOrEqual(1);
  });

  it("reads that garage's records only, and logs each one", async () => {
    const { cookie } = await open(await issue());
    const list = await http().get('/v1/customers').set('Cookie', cookie).expect(200);
    expect(list.body.items.map((c: { id: string }) => c.id)).toEqual([customerId]);
    await http().get(`/v1/customers/${customerId}`).set('Cookie', cookie).expect(200);
    // Owner-only pages open too.
    await http().get('/v1/users').set('Cookie', cookie).expect(200);

    const viewed = (await logs('RECORD_VIEWED')).map((l) => l.path);
    expect(viewed).toEqual(
      expect.arrayContaining(['/v1/customers', `/v1/customers/${customerId}`, '/v1/users']),
    );
    // The customer view is in the garage's own audit log too, under the admin.
    expect(
      await platform.auditLog.count({
        where: {
          action: 'customer.view',
          entityId: customerId,
          actorType: 'ADMIN',
          actorId: adminId,
        },
      }),
    ).toBeGreaterThanOrEqual(1);
  });

  it('refuses every change', async () => {
    const { cookie } = await open(await issue());
    const before = await platform.garageCustomer.count({ where: { garageId: g.garageId } });
    const add = await http()
      .post('/v1/customers')
      .set('Cookie', cookie)
      .send({ name: 'Should not exist', phone: randomPhone() })
      .expect(403);
    expect(add.body.code).toBe('VIEW_ONLY');
    await http()
      .patch(`/v1/customers/${customerId}`)
      .set('Cookie', cookie)
      .send({ name: 'Changed' })
      .expect(403);
    await http().post('/v1/branches').set('Cookie', cookie).send({ name: 'New' }).expect(403);
    expect(await platform.garageCustomer.count({ where: { garageId: g.garageId } })).toBe(before);
    const row = await platform.garageCustomer.findUniqueOrThrow({ where: { id: customerId } });
    expect(row.name).toBe('Viewed Customer');
  });

  it('a code works once, and only for its garage', async () => {
    const code = await issue();
    await open(code);
    const again = await http().post('/v1/auth/view-as').send({ code }).expect(400);
    expect(again.body.code).toBe('INVALID_LINK');
    await http()
      .post('/v1/auth/view-as')
      .send({ code: 'x'.repeat(43) })
      .expect(400);

    // A session of the other garage sees none of this garage's customers.
    const { cookie } = await open(await issue(other.garageId));
    const list = await http().get('/v1/customers').set('Cookie', cookie).expect(200);
    expect(list.body.items).toEqual([]);
    await http().get(`/v1/customers/${customerId}`).set('Cookie', cookie).expect(404);
  });

  it('works for a locked garage, so support can help it', async () => {
    const locked = await createGarageWithOwner(app);
    await platform.garage.update({
      where: { id: locked.garageId },
      data: { status: 'SUSPENDED', suspendedAt: new Date() },
    });
    const { cookie } = await open(await issue(locked.garageId));
    await http().get('/v1/customers').set('Cookie', cookie).expect(200);
  });

  it('is never refreshed, and signing out ends it with a log row', async () => {
    const { cookie } = await open(await issue());
    const refresh = await http().post('/v1/auth/refresh').set('Cookie', cookie);
    expect(refresh.status).toBe(401);

    const { cookie: second } = await open(await issue());
    const endsBefore = (await logs('VIEW_AS_GARAGE_END')).length;
    await http().post('/v1/auth/logout').set('Cookie', second).expect(204);
    expect((await logs('VIEW_AS_GARAGE_END')).length).toBe(endsBefore + 1);
    await http().get('/v1/customers').set('Cookie', second).expect(401);
  });

  it('stops when the admin is deactivated', async () => {
    const { cookie } = await open(await issue());
    await platform.adminUser.update({ where: { id: adminId }, data: { isActive: false } });
    try {
      await http().get('/v1/customers').set('Cookie', cookie).expect(401);
    } finally {
      await platform.adminUser.update({ where: { id: adminId }, data: { isActive: true } });
    }
  });
});
