// Step 6.2: the owner app's auth and profile (docs/mobile-api.md 2, 3; flow.md 2.4).
// What an owner may reach is proven in tenancy-owner.spec.ts.
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { PlatformDb } from '../src/common/db/platform-db';
import { createTestApp } from './helpers/app';
import {
  OWNER_PASSWORD,
  type TestOwner,
  addCustomer,
  createOwnerAccount,
  latestOwnerLinkToken,
  ownerLogin,
} from './helpers/owners';
import {
  type TestStaffGarage,
  createGarageWithOwner,
  randomPhone,
  staffLogin,
} from './helpers/staff';

describe('Owner app: auth and profile (step 6.2)', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let g: TestStaffGarage;
  let staff: string;

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    g = await createGarageWithOwner(app);
    ({ cookie: staff } = await staffLogin(app, g.ownerEmail, g.password));
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('login, refresh, logout (2.2 to 2.4)', () => {
    let owner: TestOwner;

    beforeAll(async () => {
      owner = await createOwnerAccount(app, staff);
    });

    it('signs in with a 15-minute access token and a 30-day refresh token', async () => {
      const res = await http()
        .post('/mobile/v1/auth/login')
        .send({ email: owner.email.toUpperCase(), password: OWNER_PASSWORD })
        .expect(200);
      expect(res.body.owner).toEqual({
        id: owner.ownerId,
        name: 'Sara Haddad',
        email: owner.email,
        locale: 'en',
      });
      const minutes = (Date.parse(res.body.accessExpiresAt) - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(14);
      expect(minutes).toBeLessThanOrEqual(15);
      const days = (Date.parse(res.body.refreshExpiresAt) - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29.9);
      expect(
        (await platform.owner.findUniqueOrThrow({ where: { id: owner.ownerId } })).lastLoginAt,
      ).toBeInstanceOf(Date);
      expect(
        await platform.auditLog.findFirst({
          where: { action: 'owner.login', actorType: 'OWNER', actorId: owner.ownerId },
        }),
      ).toMatchObject({ garageId: null });
    });

    it('one error for a wrong password, an unknown email and an account without password', async () => {
      const invitedOnly = randomPhone();
      const email = `invited-${invitedOnly.slice(-6)}@test.local`;
      const customerId = await addCustomer(app, staff, invitedOnly, email);
      await http().post(`/v1/customers/${customerId}/app-invite`).set('Cookie', staff).expect(200);

      for (const body of [
        { email: owner.email, password: 'wrong password 1' },
        { email: 'nobody@test.local', password: OWNER_PASSWORD },
        { email, password: OWNER_PASSWORD },
      ]) {
        const res = await http().post('/mobile/v1/auth/login').send(body).expect(401);
        expect(res.body.code).toBe('INVALID_CREDENTIALS');
      }
    });

    it('a refresh token works once; reusing it ends every session', async () => {
      const first = await ownerLogin(app, owner.email);
      const other = await ownerLogin(app, owner.email);
      const rotated = await http()
        .post('/mobile/v1/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200);
      expect(rotated.body.refreshToken).not.toBe(first.refreshToken);
      await http().get('/mobile/v1/me').set(bearer(rotated.body.accessToken)).expect(200);

      const reuse = await http()
        .post('/mobile/v1/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(401);
      expect(reuse.body.code).toBe('INVALID_LINK');
      // The new token and the owner's other phone are signed out too.
      for (const refreshToken of [rotated.body.refreshToken, other.refreshToken]) {
        await http().post('/mobile/v1/auth/refresh').send({ refreshToken }).expect(401);
      }
      await http().get('/mobile/v1/me').set(bearer(other.accessToken)).expect(401);
    });

    it('logout ends the session', async () => {
      const s = await ownerLogin(app, owner.email);
      await http()
        .post('/mobile/v1/auth/logout')
        .send({ refreshToken: s.refreshToken })
        .expect(204);
      await http().get('/mobile/v1/me').set(bearer(s.accessToken)).expect(401);
      const res = await http()
        .post('/mobile/v1/auth/refresh')
        .send({ refreshToken: s.refreshToken })
        .expect(401);
      expect(res.body.code).toBe('INVALID_LINK');
    });

    it('needs an owner Bearer token: none, garbage or a staff token are refused', async () => {
      await http().get('/mobile/v1/me').expect(401);
      await http().get('/mobile/v1/me').set(bearer('not-a-token')).expect(401);
      const staffToken = staff.replace('gv_at=', '');
      await http().get('/mobile/v1/me').set(bearer(staffToken)).expect(401);
      // And an owner token is no staff session.
      const s = await ownerLogin(app, owner.email);
      await http().get('/v1/auth/me').set('Cookie', `gv_at=${s.accessToken}`).expect(401);
    });
  });

  describe('profile (3.1 to 3.3)', () => {
    it('lists every garage where the person is a customer', async () => {
      const owner = await createOwnerAccount(app, staff);
      const other = await createGarageWithOwner(app);
      const { cookie } = await staffLogin(app, other.ownerEmail, other.password);
      await addCustomer(app, cookie, owner.phone);
      const { accessToken } = await ownerLogin(app, owner.email);

      const me = await http().get('/mobile/v1/me').set(bearer(accessToken)).expect(200);
      expect(me.body).toMatchObject({
        id: owner.ownerId,
        email: owner.email,
        phone: owner.phone,
        locale: 'en',
        unreadNotifications: 0,
      });
      expect(me.body.garages.map((x: { id: string }) => x.id).sort()).toEqual(
        [g.garageId, other.garageId].sort(),
      );
      expect(me.body.garages[0]).toEqual({
        id: expect.any(String),
        name: expect.any(String),
        phone: '+9610000000',
        locationText: 'Test',
        hasLogo: false,
        remindersOptOut: false,
        marketingOptOut: false,
      });

      const patched = await http()
        .patch('/mobile/v1/me')
        .set(bearer(accessToken))
        .send({ locale: 'ar' })
        .expect(200);
      expect(patched.body.locale).toBe('ar');
      await http()
        .patch('/mobile/v1/me')
        .set(bearer(accessToken))
        .send({ locale: 'fr' })
        .expect(400);
    });

    it('preferences change one garage only', async () => {
      const owner = await createOwnerAccount(app, staff);
      const other = await createGarageWithOwner(app);
      const { cookie } = await staffLogin(app, other.ownerEmail, other.password);
      const otherCustomerId = await addCustomer(app, cookie, owner.phone);
      const { accessToken } = await ownerLogin(app, owner.email);

      const res = await http()
        .patch(`/mobile/v1/garages/${g.garageId}/preferences`)
        .set(bearer(accessToken))
        .send({ marketingOptOut: true })
        .expect(200);
      expect(res.body).toMatchObject({
        id: g.garageId,
        remindersOptOut: false,
        marketingOptOut: true,
      });
      const here = await platform.garageCustomer.findUniqueOrThrow({
        where: { id: owner.customerId },
      });
      const there = await platform.garageCustomer.findUniqueOrThrow({
        where: { id: otherCustomerId },
      });
      expect(here.marketingOptOut).toBe(true);
      expect(there.marketingOptOut).toBe(false);
      // The garage sees the owner's choice.
      const detail = await http().get(`/v1/customers/${owner.customerId}`).set('Cookie', staff);
      expect(detail.body.marketingOptOut).toBe(true);

      await http()
        .patch(`/mobile/v1/garages/${g.garageId}/preferences`)
        .set(bearer(accessToken))
        .send({})
        .expect(400);
    });
  });

  describe('password (3.4), forgot password (2.5), delete account (3.5)', () => {
    it('changing the password keeps this session and ends the others', async () => {
      const owner = await createOwnerAccount(app, staff);
      const here = await ownerLogin(app, owner.email);
      const elsewhere = await ownerLogin(app, owner.email);

      const wrong = await http()
        .post('/mobile/v1/me/password')
        .set(bearer(here.accessToken))
        .send({ currentPassword: 'wrong password 1', newPassword: 'brand new password' })
        .expect(401);
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
      await http()
        .post('/mobile/v1/me/password')
        .set(bearer(here.accessToken))
        .send({ currentPassword: OWNER_PASSWORD, newPassword: 'short' })
        .expect(400);
      await http()
        .post('/mobile/v1/me/password')
        .set(bearer(here.accessToken))
        .send({ currentPassword: OWNER_PASSWORD, newPassword: 'brand new password' })
        .expect(204);

      await http().get('/mobile/v1/me').set(bearer(here.accessToken)).expect(200);
      await http().get('/mobile/v1/me').set(bearer(elsewhere.accessToken)).expect(401);
      await http()
        .post('/mobile/v1/auth/login')
        .send({ email: owner.email, password: OWNER_PASSWORD })
        .expect(401);
      await ownerLogin(app, owner.email, 'brand new password');
    });

    it('forgot password: always 202; an account gets one reset email a minute', async () => {
      const owner = await createOwnerAccount(app, staff);
      const before = await platform.notification.count({ where: { ownerId: owner.ownerId } });

      await http()
        .post('/mobile/v1/auth/forgot-password')
        .send({ email: 'nobody@test.local' })
        .expect(202);
      await http().post('/mobile/v1/auth/forgot-password').send({ email: owner.email }).expect(202);
      await http().post('/mobile/v1/auth/forgot-password').send({ email: owner.email }).expect(202);

      const resets = await platform.notification.findMany({
        where: { ownerId: owner.ownerId, template: 'password-reset' },
      });
      expect(resets).toHaveLength(1);
      expect(resets[0]).toMatchObject({
        channel: 'EMAIL',
        recipient: owner.email,
        garageId: g.garageId,
      });
      expect(await platform.notification.count({ where: { ownerId: owner.ownerId } })).toBe(
        before + 1,
      );
      const row = await platform.owner.findUniqueOrThrow({ where: { id: owner.ownerId } });
      const hours = (row.inviteExpiresAt!.getTime() - Date.now()) / 3_600_000;
      expect(hours).toBeGreaterThan(23.9);
      expect(hours).toBeLessThanOrEqual(24);

      // The link sets a new password on the same page.
      const token = await latestOwnerLinkToken(app, owner.ownerId);
      await http()
        .post('/mobile/v1/auth/set-password')
        .send({ token, password: 'reset password 123' })
        .expect(200);
      await ownerLogin(app, owner.email, 'reset password 123');
    });

    it('deleting the account removes the login; the garage keeps its customer', async () => {
      const owner = await createOwnerAccount(app, staff);
      const s = await ownerLogin(app, owner.email);
      const wrong = await http()
        .delete('/mobile/v1/me')
        .set(bearer(s.accessToken))
        .send({ password: 'wrong password 1' })
        .expect(401);
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');

      await http()
        .delete('/mobile/v1/me')
        .set(bearer(s.accessToken))
        .send({ password: OWNER_PASSWORD })
        .expect(204);
      await http().get('/mobile/v1/me').set(bearer(s.accessToken)).expect(401);
      await http()
        .post('/mobile/v1/auth/refresh')
        .send({ refreshToken: s.refreshToken })
        .expect(401);
      await http()
        .post('/mobile/v1/auth/login')
        .send({ email: owner.email, password: OWNER_PASSWORD })
        .expect(401);
      const row = await platform.owner.findUniqueOrThrow({ where: { id: owner.ownerId } });
      expect(row).toMatchObject({ email: null, passwordHash: null, inviteTokenHash: null });
      expect(
        await platform.session.count({
          where: { subjectType: 'OWNER', subjectId: owner.ownerId, revokedAt: null },
        }),
      ).toBe(0);

      // The garage still has the customer, and can invite the person again.
      const detail = await http().get(`/v1/customers/${owner.customerId}`).set('Cookie', staff);
      expect(detail.status).toBe(200);
      expect(detail.body.appStatus).toBe('INVITED');
      await http()
        .post(`/v1/customers/${owner.customerId}/app-invite`)
        .set('Cookie', staff)
        .expect(200);
    });
  });
});
