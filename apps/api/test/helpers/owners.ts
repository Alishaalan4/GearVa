import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PlatformDb } from '../../src/common/db/platform-db';
import { randomPhone } from './staff';

export const OWNER_PASSWORD = 'owner app password 1';

export interface TestOwner {
  ownerId: string;
  email: string;
  phone: string;
  /** the customer row at the garage that invited them */
  customerId: string;
}

/** Adds a customer (phone, name, email) to the garage of this staff cookie. */
export async function addCustomer(
  app: INestApplication,
  staffCookie: string,
  phone: string,
  email: string | null = null,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/customers')
    .set('Cookie', staffCookie)
    .send({ name: 'Sara Haddad', phone, ...(email ? { email } : {}) });
  if (res.status !== 201 && res.status !== 200) throw new Error(`add customer: ${res.status}`);
  const id = res.body.id as string;
  if (email) {
    await request(app.getHttpServer())
      .patch(`/v1/customers/${id}`)
      .set('Cookie', staffCookie)
      .send({ email })
      .expect(200);
  }
  return id;
}

/** The token from the newest owner email (invite or reset) of this owner. */
export async function latestOwnerLinkToken(
  app: INestApplication,
  ownerId: string,
): Promise<string> {
  const n = await app.get(PlatformDb).client.notification.findFirstOrThrow({
    where: { ownerId, template: { in: ['owner-invite', 'password-reset'] } },
    orderBy: { createdAt: 'desc' },
  });
  return new URL((n.payload as { link: string }).link).searchParams.get('token') as string;
}

/**
 * A car owner with an app account, made the real way (flow.md 2.4): the garage adds the
 * customer with an email, invites them, and the owner sets a password on the web page.
 */
export async function createOwnerAccount(
  app: INestApplication,
  staffCookie: string,
  phone = randomPhone(),
): Promise<TestOwner> {
  const email = `sara-${randomUUID().slice(0, 8)}@test.local`;
  const customerId = await addCustomer(app, staffCookie, phone, email);
  await request(app.getHttpServer())
    .post(`/v1/customers/${customerId}/app-invite`)
    .set('Cookie', staffCookie)
    .expect(200);
  const owner = await app.get(PlatformDb).client.owner.findUniqueOrThrow({ where: { phone } });
  await request(app.getHttpServer())
    .post('/mobile/v1/auth/set-password')
    .send({ token: await latestOwnerLinkToken(app, owner.id), password: OWNER_PASSWORD })
    .expect(200);
  return { ownerId: owner.id, email, phone, customerId };
}

/** Owner app login; returns the tokens. */
export async function ownerLogin(
  app: INestApplication,
  email: string,
  password = OWNER_PASSWORD,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request(app.getHttpServer())
    .post('/mobile/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
}
