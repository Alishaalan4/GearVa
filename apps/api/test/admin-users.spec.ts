// Step 5.9: the super admin's Users page (flow.md 11.8): admins, every garage's staff and
// the car owners, with links, typed passwords, on/off, 2FA reset and account closing.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { PlatformDb } from '../src/common/db/platform-db';
import { signInAsNewAdmin } from './helpers/admin';
import { createTestApp } from './helpers/app';
import { createOwnerAccount, ownerLogin } from './helpers/owners';
import {
  type TestStaffGarage,
  createGarageWithOwner,
  randomPhone,
  signInAsStaff,
  staffLogin,
} from './helpers/staff';

describe('Users page (step 5.9, super admins only)', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let superAdmin: { adminId: string; cookie: string };
  let g: TestStaffGarage;
  let staff: string;

  const http = () => request(app.getHttpServer());
  const as = (cookie: string) => ({
    get: (url: string) => http().get(url).set('Cookie', cookie),
    post: (url: string, body?: object) => http().post(url).set('Cookie', cookie).send(body),
    patch: (url: string, body: object) => http().patch(url).set('Cookie', cookie).send(body),
  });
  const su = () => as(superAdmin.cookie);
  const newEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@test.local`;

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    superAdmin = await signInAsNewAdmin(app, 'SUPER_ADMIN');
    g = await createGarageWithOwner(app);
    ({ cookie: staff } = await staffLogin(app, g.ownerEmail, g.password));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('a regular admin is refused everywhere', async () => {
    const { cookie } = await signInAsNewAdmin(app, 'ADMIN');
    for (const url of ['admins', 'staff', 'owners']) {
      const res = await as(cookie).get(`/admin/v1/users/${url}`).expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
    }
    await as(cookie)
      .post('/admin/v1/users/admins', {
        name: 'Sneaky',
        email: newEmail('sneaky'),
        role: 'SUPER_ADMIN',
        password: 'long enough password',
      })
      .expect(403);
  });

  describe('admins', () => {
    it('adds an admin with a typed password, who can then sign in', async () => {
      const email = newEmail('new-admin');
      const created = await su()
        .post('/admin/v1/users/admins', {
          name: 'Nadia',
          email,
          role: 'ADMIN',
          password: 'chosen admin password',
        })
        .expect(201);
      expect(created.body).toMatchObject({
        email,
        role: 'ADMIN',
        isActive: true,
        totpEnabled: false,
      });
      await http()
        .post('/admin/v1/auth/login')
        .send({ email, password: 'chosen admin password' })
        .expect(200);
      await su()
        .post('/admin/v1/users/admins', {
          name: 'Twin',
          email,
          role: 'ADMIN',
          password: 'another password 12',
        })
        .expect(409);
      await su()
        .post('/admin/v1/users/admins', {
          name: 'Short',
          email: newEmail('short'),
          role: 'ADMIN',
          password: 'short pw',
        })
        .expect(400);

      const list = await su().get('/admin/v1/users/admins').expect(200);
      expect(list.body.map((a: { email: string }) => a.email)).toContain(email);
    });

    it('a new password, a 2FA reset, and switching off sign the admin out', async () => {
      const other = await signInAsNewAdmin(app, 'ADMIN');
      const reset = await su()
        .post(`/admin/v1/users/admins/${other.adminId}/totp-reset`)
        .expect(200);
      expect(reset.body.totpEnabled).toBe(false);
      const row = await platform.adminUser.findUniqueOrThrow({ where: { id: other.adminId } });
      expect(row).toMatchObject({ totpSecretEnc: null, recoveryCodesHash: [] });

      await su()
        .post(`/admin/v1/users/admins/${other.adminId}/password`, {
          password: 'a brand new password',
        })
        .expect(204);
      await as(other.cookie).get('/admin/v1/auth/me').expect(401);

      const off = await su()
        .patch(`/admin/v1/users/admins/${other.adminId}`, { isActive: false })
        .expect(200);
      expect(off.body.isActive).toBe(false);
    });

    it('nobody switches themselves off or changes their own role; one super admin stays', async () => {
      const self = await su()
        .patch(`/admin/v1/users/admins/${superAdmin.adminId}`, { isActive: false })
        .expect(409);
      expect(self.body.code).toBe('CANNOT_MODIFY_SELF');
      await su()
        .patch(`/admin/v1/users/admins/${superAdmin.adminId}`, { role: 'ADMIN' })
        .expect(409);
      await su()
        .patch(`/admin/v1/users/admins/${superAdmin.adminId}`, { name: 'Renamed' })
        .expect(200);

      // One active super admin always remains. The test database is shared with the other
      // test files, so the number of other super admins is faked instead of changed.
      const second = await signInAsNewAdmin(app, 'SUPER_ADMIN');
      const count = jest.spyOn(platform.adminUser, 'count').mockResolvedValueOnce(0);
      const last = await su()
        .patch(`/admin/v1/users/admins/${second.adminId}`, { role: 'ADMIN' })
        .expect(409);
      expect(last.body.code).toBe('LAST_SUPER_ADMIN');
      expect(count).toHaveBeenCalled();
      count.mockRestore();
      const row = await platform.adminUser.findUniqueOrThrow({ where: { id: second.adminId } });
      expect(row).toMatchObject({ role: 'SUPER_ADMIN', isActive: true });
      // With others present, it is allowed.
      await su()
        .patch(`/admin/v1/users/admins/${second.adminId}`, { isActive: false })
        .expect(200);
    });
  });

  describe('garage staff', () => {
    it('lists staff of every garage, searchable, with garage and branch', async () => {
      const mechanic = await signInAsStaff(app, g, 'MECHANIC');
      const row = await platform.user.findUniqueOrThrow({ where: { id: mechanic.userId } });
      const res = await su()
        .get(`/admin/v1/users/staff?q=${encodeURIComponent(row.email)}`)
        .expect(200);
      expect(res.body.items).toEqual([
        {
          id: mechanic.userId,
          name: 'Test MECHANIC',
          email: row.email,
          role: 'MECHANIC',
          garage: { id: g.garageId, name: expect.any(String) },
          branchName: 'Main',
          isActive: true,
          hasPassword: true,
          lastLoginAt: expect.any(String),
        },
      ]);
      const byGarage = await su()
        .get(`/admin/v1/users/staff?garageId=${g.garageId}&role=OWNER`)
        .expect(200);
      expect(byGarage.body.items.map((u: { id: string }) => u.id)).toEqual([g.ownerId]);
    });

    it('sends a reset link (or an invite), sets a password, and switches staff off', async () => {
      const member = await signInAsStaff(app, g, 'RECEPTIONIST');
      const link = await su().post(`/admin/v1/users/staff/${member.userId}/link`).expect(200);
      expect(link.body.kind).toBe('reset');
      const n = await platform.notification.findFirstOrThrow({
        where: { userId: member.userId, template: 'password-reset' },
      });
      expect(n.garageId).toBe(g.garageId);

      await su()
        .post(`/admin/v1/users/staff/${member.userId}/password`, { password: 'typed by admin 1' })
        .expect(204);
      await http().get('/v1/auth/me').set('Cookie', member.cookie).expect(401);
      const row = await platform.user.findUniqueOrThrow({ where: { id: member.userId } });
      expect(row.inviteTokenHash).toBeNull();
      await staffLogin(app, row.email, 'typed by admin 1');

      const off = await su()
        .patch(`/admin/v1/users/staff/${member.userId}`, { isActive: false })
        .expect(200);
      expect(off.body.isActive).toBe(false);
      await su().post(`/admin/v1/users/staff/${member.userId}/link`).expect(409);
      await su().patch(`/admin/v1/users/staff/${member.userId}`, { isActive: true }).expect(200);

      // A garage's owner is not switched off here: suspend the garage instead.
      const owner = await su()
        .patch(`/admin/v1/users/staff/${g.ownerId}`, { isActive: false })
        .expect(409);
      expect(owner.body.code).toBe('CANNOT_MODIFY_OWNER');
    });
  });

  describe('car owners', () => {
    it('lists owners with their garages; the look is audit logged', async () => {
      const owner = await createOwnerAccount(app, staff);
      const res = await su()
        .get(`/admin/v1/users/owners?q=${encodeURIComponent(owner.email)}`)
        .expect(200);
      expect(res.body.items).toEqual([
        {
          id: owner.ownerId,
          name: 'Sara Haddad',
          phone: owner.phone,
          email: owner.email,
          account: 'ACTIVE',
          garages: [{ id: g.garageId, name: expect.any(String) }],
          lastLoginAt: null,
        },
      ]);
      const byPhone = await su()
        .get(`/admin/v1/users/owners?q=${owner.phone.slice(-6)}`)
        .expect(200);
      expect(byPhone.body.items.map((o: { id: string }) => o.id)).toContain(owner.ownerId);
      const audit = await platform.auditLog.findFirst({
        where: { action: 'admin.users.owners.view', actorId: superAdmin.adminId },
      });
      expect(audit).not.toBeNull();
    });

    it('sends a link, sets a password, closes the account', async () => {
      const owner = await createOwnerAccount(app, staff);
      const session = await ownerLogin(app, owner.email);

      const link = await su().post(`/admin/v1/users/owners/${owner.ownerId}/link`).expect(200);
      expect(link.body).toEqual({ kind: 'reset', email: owner.email });

      await su()
        .post(`/admin/v1/users/owners/${owner.ownerId}/password`, { password: 'typed by admin 2' })
        .expect(204);
      await http()
        .get('/mobile/v1/me')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(401);
      await ownerLogin(app, owner.email, 'typed by admin 2');

      await su().post(`/admin/v1/users/owners/${owner.ownerId}/close-account`).expect(204);
      const row = await platform.owner.findUniqueOrThrow({ where: { id: owner.ownerId } });
      expect(row).toMatchObject({ email: null, passwordHash: null });
      const none = await su().post(`/admin/v1/users/owners/${owner.ownerId}/link`).expect(409);
      expect(none.body.code).toBe('NO_LOGIN_EMAIL');
    });

    it('a customer never invited has no login: no link, no password', async () => {
      const res = await http()
        .post('/v1/customers')
        .set('Cookie', staff)
        .send({ name: 'No App', phone: randomPhone() })
        .expect(201);
      const customer = await platform.garageCustomer.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      const list = await su().get('/admin/v1/users/owners?account=NONE&pageSize=50').expect(200);
      expect(list.body.items.every((o: { account: string }) => o.account === 'NONE')).toBe(true);
      await su()
        .post(`/admin/v1/users/owners/${customer.ownerId}/password`, {
          password: 'typed by admin 3',
        })
        .expect(409);
    });
  });
});
