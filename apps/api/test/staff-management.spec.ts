// Step 1.6a: branches and staff (flow.md 1 permission matrix). Tenant isolation for these
// endpoints lives in tenancy.spec.ts (README 5.1.6).
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { PlatformDb } from '../src/common/db/platform-db';
import { createTestApp } from './helpers/app';
import { signInAsNewAdmin } from './helpers/admin';
import {
  addBranch,
  type TestStaffGarage,
  createGarageWithOwner,
  latestLinkToken,
  staffLogin,
} from './helpers/staff';

describe('Branches and staff', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let a: TestStaffGarage;
  let ownerA: string;

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
    ({ cookie: ownerA } = await staffLogin(app, a.ownerEmail, a.password));
  });

  afterAll(async () => {
    await app?.close();
  });

  // Since 2026-11-16 Gearva (admin) adds branches and switches them on or off (flow.md
  // 11.7); the owner edits the name, address and phone.
  describe('branches', () => {
    let admin: string;
    const branchesUrl = () => `/admin/v1/garages/${a.garageId}/branches`;
    const asAdmin = {
      get: (url: string) => http().get(url).set('Cookie', admin),
      post: (url: string, body: object) => http().post(url).set('Cookie', admin).send(body),
      patch: (url: string, body: object) => http().patch(url).set('Cookie', admin).send(body),
    };

    beforeAll(async () => {
      // A plain ADMIN: every admin manages branches, not only super admins.
      ({ cookie: admin } = await signInAsNewAdmin(app, 'ADMIN'));
    });

    it('the admin adds a branch; it gets the next code and an audit row with the garage', async () => {
      const res = await asAdmin
        .post(branchesUrl(), { name: 'Jounieh', phone: '+961 9 000 000', address: '' })
        .expect(201);
      expect(res.body).toMatchObject({
        code: 'BR2',
        isMain: false,
        isActive: true,
        address: null,
        phone: '+9619000000',
        activeStaff: 0,
      });
      const badPhone = await asAdmin.post(branchesUrl(), { name: 'X', phone: '123' }).expect(400);
      expect(badPhone.body.code).toBe('VALIDATION_FAILED');

      const list = await as(ownerA).get('/v1/branches').expect(200);
      expect(list.body.items.map((x: { code: string }) => x.code)).toEqual(['BR1', 'BR2']);
      const adminList = await asAdmin.get(branchesUrl()).expect(200);
      expect(adminList.body.map((x: { code: string }) => x.code)).toEqual(['BR1', 'BR2']);
      // The owner works in every branch (branchId null), so no one is counted here yet.
      expect(adminList.body[0]).toMatchObject({ isMain: true, activeStaff: 0 });

      const audit = await platform.auditLog.findFirst({
        where: { action: 'admin.branch.create', entityId: res.body.id },
      });
      expect(audit).toMatchObject({ actorType: 'ADMIN', garageId: a.garageId });
      await asAdmin
        .get('/admin/v1/garages/0193a0d0-0000-7000-8000-000000000000/branches')
        .expect(404);
    });

    it('the owner cannot add a branch or switch one on or off, but can rename it', async () => {
      await as(ownerA).post('/v1/branches', { name: 'Mine' }).expect(404);
      const branch = await addBranch(app, a.garageId, 'Temp');
      const off = await as(ownerA)
        .patch(`/v1/branches/${branch.id}`, { isActive: false })
        .expect(403);
      expect(off.body.code).toBe('BRANCHES_MANAGED_BY_GEARVA');
      const renamed = await as(ownerA)
        .patch(`/v1/branches/${branch.id}`, { name: 'Temp 2', address: 'Main road' })
        .expect(200);
      expect(renamed.body).toMatchObject({ name: 'Temp 2', address: 'Main road', isActive: true });
    });

    it('the admin switches a branch off and on, but never the main one', async () => {
      const branch = await addBranch(app, a.garageId, 'Seasonal');
      const off = await asAdmin
        .patch(`${branchesUrl()}/${branch.id}`, { name: 'Seasonal 2', isActive: false })
        .expect(200);
      expect(off.body).toMatchObject({ name: 'Seasonal 2', isActive: false, code: branch.code });
      await asAdmin.patch(`${branchesUrl()}/${branch.id}`, { isActive: true }).expect(200);

      const main = await asAdmin
        .patch(`${branchesUrl()}/${a.branchId}`, { isActive: false })
        .expect(409);
      expect(main.body.code).toBe('MAIN_BRANCH_REQUIRED');
      // A branch of another garage is not found under this one.
      const other = await createGarageWithOwner(app);
      await asAdmin.patch(`${branchesUrl()}/${other.branchId}`, { name: 'Other' }).expect(404);
    });

    it('a branch with active staff cannot be switched off until they are moved', async () => {
      const branch = await addBranch(app, a.garageId, 'Busy');
      const { member } = await inviteAndActivate('MECHANIC', branch.id);

      const blocked = await asAdmin
        .patch(`${branchesUrl()}/${branch.id}`, { isActive: false })
        .expect(409);
      expect(blocked.body).toMatchObject({ code: 'BRANCH_HAS_STAFF', details: { activeStaff: 1 } });

      // Moved to the main branch: now the branch can be switched off.
      await as(ownerA).patch(`/v1/users/${member.id}`, { branchId: a.branchId }).expect(200);
      await asAdmin.patch(`${branchesUrl()}/${branch.id}`, { isActive: false }).expect(200);

      // Nobody can be placed in it while it is off.
      const moveBack = await as(ownerA)
        .patch(`/v1/users/${member.id}`, { branchId: branch.id })
        .expect(409);
      expect(moveBack.body.code).toBe('BRANCH_INACTIVE');
    });

    it('a deactivated member cannot be reactivated into a branch that was switched off', async () => {
      const branch = await addBranch(app, a.garageId, 'Closing');
      const { member } = await inviteAndActivate('RECEPTIONIST', branch.id);
      await as(ownerA).patch(`/v1/users/${member.id}`, { isActive: false }).expect(200);
      await asAdmin.patch(`${branchesUrl()}/${branch.id}`, { isActive: false }).expect(200);

      const res = await as(ownerA).patch(`/v1/users/${member.id}`, { isActive: true }).expect(409);
      expect(res.body.code).toBe('BRANCH_INACTIVE');
      // Reactivating together with a move to an active branch works.
      await as(ownerA)
        .patch(`/v1/users/${member.id}`, { isActive: true, branchId: a.branchId })
        .expect(200);
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
      await as(mechanic.cookie).patch(`/v1/branches/${a.branchId}`, { name: 'Nope' }).expect(403);

      const manager = await inviteAndActivate('MANAGER', null);
      await as(manager.cookie).get('/v1/branches').expect(200);
      await as(manager.cookie).patch(`/v1/branches/${a.branchId}`, { name: 'Nope' }).expect(403);
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
});
