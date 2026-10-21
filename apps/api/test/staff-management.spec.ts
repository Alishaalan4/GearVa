// Step 1.6a: branches and staff (flow.md 1 permission matrix), including tenant
// isolation for every new endpoint (README 5.1.6): garage B can never read or change
// garage A's branches or staff.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { PlatformDb } from '../src/common/db/platform-db';
import { createTestApp } from './helpers/app';
import {
  type TestStaffGarage,
  createGarageWithOwner,
  latestLinkToken,
  staffLogin,
} from './helpers/staff';

describe('Branches and staff', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let a: TestStaffGarage;
  let b: TestStaffGarage;
  let ownerA: string;
  let ownerB: string;

  const http = () => request(app.getHttpServer());
  const as = (cookie: string) => ({
    get: (url: string) => http().get(url).set('Cookie', cookie),
    post: (url: string, body?: object) => http().post(url).set('Cookie', cookie).send(body),
    patch: (url: string, body: object) => http().patch(url).set('Cookie', cookie).send(body),
  });

  /** Invites a member in garage A and signs them in through their own invite link. */
  async function inviteAndActivate(role: string, branchId: string | null) {
    const email = `${role.toLowerCase()}-${randomUUID().slice(0, 8)}@test.local`;
    const member = (
      await as(ownerA)
        .post('/v1/users', { name: `Test ${role}`, email, role, branchId, locale: 'ar' })
        .expect(201)
    ).body;
    const token = await latestLinkToken(platform, member.id);
    await http()
      .post('/v1/auth/set-password')
      .send({ token, password: 'member password 1' })
      .expect(200);
    const { cookie } = await staffLogin(app, email, 'member password 1');
    return { member, cookie };
  }

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    a = await createGarageWithOwner(app);
    b = await createGarageWithOwner(app);
    ({ cookie: ownerA } = await staffLogin(app, a.ownerEmail, a.password));
    ({ cookie: ownerB } = await staffLogin(app, b.ownerEmail, b.password));
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('branches', () => {
    it('the owner adds a branch; it gets the next code and an audit row', async () => {
      const res = await as(ownerA)
        .post('/v1/branches', { name: 'Jounieh', phone: '+961 9 000 000', address: '' })
        .expect(201);
      expect(res.body).toMatchObject({ code: 'BR2', isMain: false, isActive: true, address: null });

      const list = await as(ownerA).get('/v1/branches').expect(200);
      expect(list.body.items.map((x: { code: string }) => x.code)).toEqual(['BR1', 'BR2']);

      const audit = await platform.auditLog.findFirst({
        where: { action: 'branch.create', entityId: res.body.id },
      });
      expect(audit).toMatchObject({ actorType: 'STAFF', actorId: a.ownerId, garageId: a.garageId });
    });

    it('the owner renames and deactivates a branch, but never the main one', async () => {
      const created = (await as(ownerA).post('/v1/branches', { name: 'Temp' }).expect(201)).body;
      const updated = await as(ownerA)
        .patch(`/v1/branches/${created.id}`, { name: 'Temp 2', isActive: false })
        .expect(200);
      expect(updated.body).toMatchObject({ name: 'Temp 2', isActive: false, code: created.code });

      const main = await as(ownerA)
        .patch(`/v1/branches/${a.branchId}`, { isActive: false })
        .expect(409);
      expect(main.body.code).toBe('MAIN_BRANCH_REQUIRED');
    });
  });

  describe('staff', () => {
    it('mechanics need a branch; the invite sends an email in their language', async () => {
      const email = `mech-${randomUUID().slice(0, 8)}@test.local`;
      const missing = await as(ownerA)
        .post('/v1/users', { name: 'Mech', email, role: 'MECHANIC', branchId: null, locale: 'ar' })
        .expect(400);
      expect(missing.body.code).toBe('VALIDATION_FAILED');

      const res = await as(ownerA)
        .post('/v1/users', {
          name: 'Mech',
          email,
          role: 'MECHANIC',
          branchId: a.branchId,
          locale: 'ar',
        })
        .expect(201);
      expect(res.body).toMatchObject({
        role: 'MECHANIC',
        branchId: a.branchId,
        hasPassword: false,
      });
      const invite = await platform.notification.findFirstOrThrow({
        where: { userId: res.body.id },
      });
      expect(invite).toMatchObject({ template: 'staff-invite', locale: 'ar', recipient: email });

      const dup = await as(ownerA)
        .post('/v1/users', { name: 'Again', email, role: 'MANAGER', branchId: null, locale: 'en' })
        .expect(409);
      expect(dup.body.code).toBe('EMAIL_ALREADY_USED');
    });

    it('roles follow the permission matrix: only the owner manages staff and branches', async () => {
      const mechanic = await inviteAndActivate('MECHANIC', a.branchId);
      expect((await as(mechanic.cookie).get('/v1/auth/me').expect(200)).body).toMatchObject({
        role: 'MECHANIC',
        branchId: a.branchId,
      });
      expect((await as(mechanic.cookie).get('/v1/users').expect(403)).body.code).toBe('FORBIDDEN');
      await as(mechanic.cookie).get('/v1/branches').expect(403);
      await as(mechanic.cookie).post('/v1/branches', { name: 'Nope' }).expect(403);

      const manager = await inviteAndActivate('MANAGER', null);
      await as(manager.cookie).get('/v1/branches').expect(200);
      await as(manager.cookie).post('/v1/branches', { name: 'Nope' }).expect(403);
      await as(manager.cookie).get('/v1/users').expect(403);
    });

    it('a deactivated member is signed out at once', async () => {
      const { member, cookie } = await inviteAndActivate('RECEPTIONIST', a.branchId);
      await as(cookie).get('/v1/auth/me').expect(200);
      await as(ownerA).patch(`/v1/users/${member.id}`, { isActive: false }).expect(200);
      await as(cookie).get('/v1/auth/me').expect(401);
    });

    it('a role change keeps the branch rule; invite vs reset follow the password state', async () => {
      const { member } = await inviteAndActivate('MANAGER', null);
      const res = await as(ownerA)
        .patch(`/v1/users/${member.id}`, { role: 'MECHANIC' })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');

      const invite = await as(ownerA).post(`/v1/users/${member.id}/invite`).expect(409);
      expect(invite.body.code).toBe('USER_ALREADY_ACTIVE');
      await as(ownerA).post(`/v1/users/${member.id}/password-reset`).expect(200);
    });

    it('the owner account cannot be changed from the staff screen', async () => {
      const res = await as(ownerA).patch(`/v1/users/${a.ownerId}`, { isActive: false }).expect(403);
      expect(res.body.code).toBe('CANNOT_MODIFY_OWNER');
    });
  });

  describe('tenant isolation (README 5.1)', () => {
    it("garage B's lists never contain garage A's rows", async () => {
      const branches = await as(ownerB).get('/v1/branches?pageSize=50').expect(200);
      expect(branches.body.items.length).toBeGreaterThan(0);
      for (const branch of branches.body.items) expect(branch.id).not.toBe(a.branchId);

      const users = await as(ownerB).get('/v1/users?pageSize=50').expect(200);
      expect(users.body.items.map((u: { id: string }) => u.id)).toEqual([b.ownerId]);
    });

    it("garage B gets 404 for garage A's ids, and nothing changes", async () => {
      const member = (
        await as(ownerA)
          .post('/v1/users', {
            name: 'Target',
            email: `target-${randomUUID().slice(0, 8)}@test.local`,
            role: 'MANAGER',
            branchId: null,
            locale: 'en',
          })
          .expect(201)
      ).body;

      await as(ownerB).patch(`/v1/branches/${a.branchId}`, { name: 'Hacked' }).expect(404);
      await as(ownerB).patch(`/v1/users/${member.id}`, { name: 'Hacked' }).expect(404);
      await as(ownerB).post(`/v1/users/${member.id}/invite`).expect(404);
      await as(ownerB).post(`/v1/users/${member.id}/password-reset`).expect(404);
      // Garage A's branch id cannot be used to place a garage B member.
      await as(ownerB)
        .post('/v1/users', {
          name: 'Sneaky',
          email: `sneaky-${randomUUID().slice(0, 8)}@test.local`,
          role: 'MECHANIC',
          branchId: a.branchId,
          locale: 'en',
        })
        .expect(404);

      const branch = await platform.branch.findUniqueOrThrow({ where: { id: a.branchId } });
      expect(branch.name).toBe('Main');
      const target = await platform.user.findUniqueOrThrow({ where: { id: member.id } });
      expect(target.name).toBe('Target');
    });
  });
});
