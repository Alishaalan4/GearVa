// Admin login with optional 2FA through the real HTTP stack (flow.md 2.3, README 5.2):
// password-only login -> turn 2FA on -> login needs a code -> recovery codes -> refresh
// rotation -> logout -> turn 2FA off.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@gearva/database';
import { Secret, TOTP } from 'otpauth';
import request from 'supertest';
import { PasswordService } from '../src/auth/password.service';
import { PlatformDb } from '../src/common/db/platform-db';
import { cookiesOf, createTestApp } from './helpers/app';

const AT = 'gv_admin_at';
const RT = 'gv_admin_rt';
const MFA = 'gv_admin_mfa';

function currentCode(secret: string): string {
  return new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
}

const withCookies = (cookies: Record<string, string | undefined>) =>
  Object.entries(cookies)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

describe('Admin auth', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  const email = `admin-${randomUUID()}@test.local`;
  const password = 'correct horse battery staple';
  let adminId: string;

  // Shared across the ordered tests below.
  let totpSecret: string;
  let recoveryCodes: string[];

  const http = () => request(app.getHttpServer());

  async function passwordStep() {
    return http().post('/admin/v1/auth/login').send({ email, password }).expect(200);
  }

  /** Login while 2FA is on; returns the session cookies. */
  async function loginWithCode(): Promise<{ at: string; rt: string }> {
    const step1 = await passwordStep();
    expect(step1.body).toEqual({ next: 'TOTP_VERIFY' });
    const res = await http()
      .post('/admin/v1/auth/totp/verify')
      .set('Cookie', withCookies({ [MFA]: cookiesOf(step1)[MFA] }))
      .send({ code: currentCode(totpSecret) })
      .expect(200);
    const c = cookiesOf(res);
    return { at: c[AT] as string, rt: c[RT] as string };
  }

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    const admin = await platform.adminUser.create({
      data: {
        email,
        name: '[test] admin',
        role: 'SUPER_ADMIN',
        passwordHash: await app.get(PasswordService).hash(password),
      },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('a wrong password is rejected with INVALID_CREDENTIALS', async () => {
    const res = await http()
      .post('/admin/v1/auth/login')
      .send({ email, password: 'wrong' })
      .expect(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('an unknown email gets exactly the same answer', async () => {
    const res = await http()
      .post('/admin/v1/auth/login')
      .send({ email: `nobody-${randomUUID()}@test.local`, password })
      .expect(401);
    expect(res.body).toEqual({
      code: 'INVALID_CREDENTIALS',
      message: 'Wrong email or password',
      details: {},
    });
  });

  it('with 2FA off, the password alone signs in and writes an admin.login audit row', async () => {
    const res = await passwordStep();
    expect(res.body).toEqual({
      next: 'DONE',
      admin: { id: adminId, email, name: '[test] admin', role: 'SUPER_ADMIN', totpEnabled: false },
      id: adminId,
    });
    const cookies = cookiesOf(res);
    expect(cookies[MFA]).toBeUndefined();

    const me = await http()
      .get('/admin/v1/auth/me')
      .set('Cookie', withCookies({ [AT]: cookies[AT] }))
      .expect(200);
    expect(me.body.totpEnabled).toBe(false);

    const rows = await platform.auditLog.findMany({
      where: { action: 'admin.login', actorId: adminId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorType: 'ADMIN', garageId: null, entityId: adminId });
  });

  it('protected endpoints need the access cookie', async () => {
    const res = await http().get('/admin/v1/auth/me').expect(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    await http().post('/admin/v1/auth/totp/setup').expect(401);
  });

  it('a signed-in admin can turn 2FA on: setup, then one correct code', async () => {
    const at = cookiesOf(await passwordStep())[AT];
    const asAdmin = (path: string, body?: object) =>
      http()
        .post(path)
        .set('Cookie', withCookies({ [AT]: at }))
        .send(body);

    // Enabling before setup is refused.
    const early = await asAdmin('/admin/v1/auth/totp/enable', { code: '123456' }).expect(409);
    expect(early.body.code).toBe('TOTP_SETUP_REQUIRED');

    const setup = await asAdmin('/admin/v1/auth/totp/setup').expect(200);
    expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    totpSecret = setup.body.secret;

    // Stored encrypted, never as the plain base32 secret.
    const stored = await platform.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    expect(stored.totpSecretEnc).toBeTruthy();
    expect(stored.totpSecretEnc).not.toContain(totpSecret);
    expect(stored.totpEnabled).toBe(false);

    const wrong = await asAdmin('/admin/v1/auth/totp/enable', { code: '000000' }).expect(401);
    expect(wrong.body.code).toBe('INVALID_2FA_CODE');

    const enabled = await asAdmin('/admin/v1/auth/totp/enable', {
      code: currentCode(totpSecret),
    }).expect(200);
    expect(enabled.body.recoveryCodes).toHaveLength(10);
    recoveryCodes = enabled.body.recoveryCodes;

    const again = await asAdmin('/admin/v1/auth/totp/setup').expect(409);
    expect(again.body.code).toBe('TOTP_ALREADY_ENABLED');
  });

  it('with 2FA on, the password alone is not enough', async () => {
    const res = await passwordStep();
    expect(res.body).toEqual({ next: 'TOTP_VERIFY' });
    const cookies = cookiesOf(res);
    expect(cookies[AT]).toBeUndefined();
    expect(cookies[MFA]).toBeTruthy();

    const wrong = await http()
      .post('/admin/v1/auth/totp/verify')
      .set('Cookie', withCookies({ [MFA]: cookies[MFA] }))
      .send({ code: '000000' })
      .expect(401);
    expect(wrong.body.code).toBe('INVALID_2FA_CODE');

    const { at } = await loginWithCode();
    const me = await http()
      .get('/admin/v1/auth/me')
      .set('Cookie', withCookies({ [AT]: at }))
      .expect(200);
    expect(me.body.totpEnabled).toBe(true);
  });

  it('the code step without passing the password step is refused', async () => {
    await http().post('/admin/v1/auth/totp/verify').send({ code: '123456' }).expect(401);
  });

  it('a recovery code works exactly once', async () => {
    const code = recoveryCodes[0] as string;
    const mfa = cookiesOf(await passwordStep())[MFA];
    await http()
      .post('/admin/v1/auth/totp/verify')
      .set('Cookie', withCookies({ [MFA]: mfa }))
      .send({ recoveryCode: code })
      .expect(200);

    const again = cookiesOf(await passwordStep())[MFA];
    const reused = await http()
      .post('/admin/v1/auth/totp/verify')
      .set('Cookie', withCookies({ [MFA]: again }))
      .send({ recoveryCode: code })
      .expect(401);
    expect(reused.body.code).toBe('INVALID_2FA_CODE');
  });

  it('refresh replaces the token; reusing an old one revokes every session', async () => {
    const { rt } = await loginWithCode();

    const first = await http()
      .post('/admin/v1/auth/refresh')
      .set('Cookie', withCookies({ [RT]: rt }))
      .expect(200);
    const rt2 = cookiesOf(first)[RT] as string;
    expect(rt2).toBeTruthy();
    expect(rt2).not.toBe(rt);

    // The old token again: treated as stolen...
    await http()
      .post('/admin/v1/auth/refresh')
      .set('Cookie', withCookies({ [RT]: rt }))
      .expect(401);
    // ...so even the newest token no longer works.
    await http()
      .post('/admin/v1/auth/refresh')
      .set('Cookie', withCookies({ [RT]: rt2 }))
      .expect(401);
  });

  it('logout ends the session immediately', async () => {
    const { at, rt } = await loginWithCode();
    await http()
      .get('/admin/v1/auth/me')
      .set('Cookie', withCookies({ [AT]: at }))
      .expect(200);

    await http()
      .post('/admin/v1/auth/logout')
      .set('Cookie', withCookies({ [RT]: rt }))
      .expect(204);

    // The access token has not expired yet, but its session is closed.
    await http()
      .get('/admin/v1/auth/me')
      .set('Cookie', withCookies({ [AT]: at }))
      .expect(401);
  });

  it('turning 2FA off needs a valid code, then the password alone signs in again', async () => {
    const { at } = await loginWithCode();
    const disable = (body: object) =>
      http()
        .post('/admin/v1/auth/totp/disable')
        .set('Cookie', withCookies({ [AT]: at }))
        .send(body);

    const wrong = await disable({ code: '000000' }).expect(401);
    expect(wrong.body.code).toBe('INVALID_2FA_CODE');

    const off = await disable({ code: currentCode(totpSecret) }).expect(200);
    expect(off.body.totpEnabled).toBe(false);

    const stored = await platform.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    expect(stored).toMatchObject({
      totpEnabled: false,
      totpSecretEnc: null,
      recoveryCodesHash: [],
    });

    expect((await passwordStep()).body.next).toBe('DONE');
  });
});
