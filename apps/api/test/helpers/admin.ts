import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Secret, TOTP } from 'otpauth';
import request from 'supertest';
import { PasswordService } from '../../src/auth/password.service';
import { TotpService } from '../../src/auth/totp.service';
import { PlatformDb } from '../../src/common/db/platform-db';
import { cookiesOf } from './app';

/**
 * A fresh admin with 2FA already on, signed in through the real login endpoints.
 * Returns the Cookie header value for admin requests.
 */
export async function signInAsNewAdmin(
  app: INestApplication,
): Promise<{ adminId: string; cookie: string }> {
  const platform = app.get(PlatformDb).client;
  const totp = app.get(TotpService);
  const email = `admin-${randomUUID()}@test.local`;
  const password = 'test admin password';
  const secret = totp.newSecret();

  const admin = await platform.adminUser.create({
    data: {
      email,
      name: '[test] admin',
      role: 'ADMIN',
      passwordHash: await app.get(PasswordService).hash(password),
      totpSecretEnc: totp.encrypt(secret),
      totpEnabled: true,
    },
  });

  const login = await request(app.getHttpServer())
    .post('/admin/v1/auth/login')
    .send({ email, password })
    .expect(200);
  const mfa = cookiesOf(login).gv_admin_mfa;
  const code = new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
  const verified = await request(app.getHttpServer())
    .post('/admin/v1/auth/totp/verify')
    .set('Cookie', `gv_admin_mfa=${mfa}`)
    .send({ code })
    .expect(200);

  return { adminId: admin.id, cookie: `gv_admin_at=${cookiesOf(verified).gv_admin_at}` };
}
