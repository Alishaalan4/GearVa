// Step 1.6a: garage staff sign-in and the subscription lock (flow.md 2.1, 2.2, 2.5).
// The first test walks Phase 1's main story end to end: admin creates a garage, the
// owner opens the invite link, sets a password and is signed in.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { PlatformDb } from '../src/common/db/platform-db';
import { signInAsNewAdmin } from './helpers/admin';
import { cookiesOf, createTestApp } from './helpers/app';
import { createGarageWithOwner, latestLinkToken, staffLogin } from './helpers/staff';

describe('Staff auth and garage lock', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let adminCookie: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    ({ cookie: adminCookie } = await signInAsNewAdmin(app));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('admin creates a garage, the owner sets a password from the invite and is signed in', async () => {
    const email = `owner-${randomUUID().slice(0, 8)}@test.local`;
    const garage = (
      await http()
        .post('/admin/v1/garages')
        .set('Cookie', adminCookie)
        .send({
          name: '[test] Invite Garage',
          email,
          phone: '+961 3 000 000',
          locationText: 'Beirut',
          defaultLocale: 'en',
          ownerName: 'Invited Owner',
          plan: 'TRIAL',
        })
        .expect(201)
    ).body;
    const token = await latestLinkToken(platform, garage.owner.id);

    // A wrong token and a too-short password are refused.
    const bad = await http()
      .post('/v1/auth/set-password')
      .send({ token: 'x'.repeat(43), password: 'long enough password' })
      .expect(400);
    expect(bad.body.code).toBe('INVALID_LINK');
    const short = await http()
      .post('/v1/auth/set-password')
      .send({ token, password: 'short' })
      .expect(400);
    expect(short.body.code).toBe('VALIDATION_FAILED');

    const res = await http()
      .post('/v1/auth/set-password')
      .send({ token, password: 'my new password' })
      .expect(200);
    expect(res.body).toMatchObject({
      id: garage.owner.id,
      email,
      role: 'OWNER',
      branchId: null,
      garage: { id: garage.id, status: 'TRIAL' },
    });
    const cookie = `gv_at=${cookiesOf(res).gv_at}`;
    await http().get('/v1/auth/me').set('Cookie', cookie).expect(200);

    // The link works once.
    const again = await http()
      .post('/v1/auth/set-password')
      .send({ token, password: 'another password' })
      .expect(400);
    expect(again.body.code).toBe('INVALID_LINK');

    // From now on the password works, and the admin sees the owner as active.
    await staffLogin(app, email, 'my new password');
    const detail = await http()
      .get(`/admin/v1/garages/${garage.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(detail.body.owner).toMatchObject({ hasPassword: true, linkExpiresAt: null });
    expect(detail.body.lastLoginAt).toBeTruthy();
  });

  it('an expired link is refused', async () => {
    const g = await createGarageWithOwner(app);
    await http()
      .post(`/admin/v1/garages/${g.garageId}/password-reset`)
      .set('Cookie', adminCookie)
      .expect(200);
    const token = await latestLinkToken(platform, g.ownerId);
    await platform.user.update({
      where: { id: g.ownerId },
      data: { inviteExpiresAt: new Date(Date.now() - 1000) },
    });
    const res = await http()
      .post('/v1/auth/set-password')
      .send({ token, password: 'my new password' })
      .expect(400);
    expect(res.body.code).toBe('INVALID_LINK');
  });

  it('login: wrong password and unknown email get the same answer; success writes an audit row', async () => {
    const g = await createGarageWithOwner(app);
    const wrong = await http()
      .post('/v1/auth/login')
      .send({ email: g.ownerEmail, password: 'wrong password' })
      .expect(401);
    const unknown = await http()
      .post('/v1/auth/login')
      .send({ email: `nobody-${randomUUID()}@test.local`, password: 'wrong password' })
      .expect(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');

    await staffLogin(app, g.ownerEmail, g.password);
    const audit = await platform.auditLog.findFirst({
      where: { action: 'user.login', actorId: g.ownerId },
    });
    expect(audit).toMatchObject({ actorType: 'STAFF', garageId: g.garageId, entityId: g.ownerId });
  });

  it('every /v1 route needs a staff session', async () => {
    const res = await http().get('/v1/auth/me').expect(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    await http().get('/v1/branches').expect(401);
    // An admin session is not a staff session.
    await http().get('/v1/auth/me').set('Cookie', adminCookie).expect(401);
  });

  it('a suspended garage is locked at once, mid-session and at login, until reactivated', async () => {
    const g = await createGarageWithOwner(app);
    const { cookie, refreshToken } = await staffLogin(app, g.ownerEmail, g.password);
    await http().get('/v1/auth/me').set('Cookie', cookie).expect(200);

    await http()
      .post(`/admin/v1/garages/${g.garageId}/suspend`)
      .set('Cookie', adminCookie)
      .send({ reason: 'Unpaid' })
      .expect(200);

    const locked = await http().get('/v1/auth/me').set('Cookie', cookie).expect(403);
    expect(locked.body).toMatchObject({ code: 'GARAGE_LOCKED', details: { reason: 'suspended' } });
    const login = await http()
      .post('/v1/auth/login')
      .send({ email: g.ownerEmail, password: g.password })
      .expect(403);
    expect(login.body.code).toBe('GARAGE_LOCKED');
    const refresh = await http()
      .post('/v1/auth/refresh')
      .set('Cookie', `gv_rt=${refreshToken}`)
      .expect(403);
    expect(refresh.body.code).toBe('GARAGE_LOCKED');

    await http()
      .post(`/admin/v1/garages/${g.garageId}/reactivate`)
      .set('Cookie', adminCookie)
      .expect(200);
    // The access token from before the suspension works again; nothing was lost.
    await http().get('/v1/auth/me').set('Cookie', cookie).expect(200);
  });

  it('a garage whose paid period or trial ended is locked without any job running', async () => {
    const g = await createGarageWithOwner(app);
    const { cookie } = await staffLogin(app, g.ownerEmail, g.password);

    await platform.garage.update({
      where: { id: g.garageId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await http().get('/v1/auth/me').set('Cookie', cookie).expect(403);
    expect(expired.body.details).toEqual({ reason: 'expired' });

    await platform.garage.update({
      where: { id: g.garageId },
      data: {
        status: 'TRIAL',
        isPaid: false,
        expiresAt: null,
        trialEndsAt: new Date(Date.now() - 1000),
      },
    });
    const trial = await http().get('/v1/auth/me').set('Cookie', cookie).expect(403);
    expect(trial.body.details).toEqual({ reason: 'trial_ended' });
  });

  it('refresh rotates the token and logout ends the session', async () => {
    const g = await createGarageWithOwner(app);
    const { cookie, refreshToken } = await staffLogin(app, g.ownerEmail, g.password);

    const refreshed = await http()
      .post('/v1/auth/refresh')
      .set('Cookie', `gv_rt=${refreshToken}`)
      .expect(200);
    const rt2 = cookiesOf(refreshed).gv_rt as string;
    expect(rt2).not.toBe(refreshToken);

    await http().post('/v1/auth/logout').set('Cookie', `gv_rt=${rt2}`).expect(204);
    // The first access token belonged to the first (rotated) session, now closed too.
    await http().get('/v1/auth/me').set('Cookie', cookie).expect(401);
  });
});
