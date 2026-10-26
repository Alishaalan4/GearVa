import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { PasswordService } from '../../src/auth/password.service';
import { PlatformDb } from '../../src/common/db/platform-db';
import { cookiesOf } from './app';

export interface TestStaffGarage {
  garageId: string;
  branchId: string;
  ownerId: string;
  ownerEmail: string;
  password: string;
}

/**
 * An ACTIVE garage (paid for a year) with main branch BR1 and an OWNER who already has a
 * password, created through the platform role like the admin module does.
 */
export async function createGarageWithOwner(app: INestApplication): Promise<TestStaffGarage> {
  const platform = app.get(PlatformDb).client;
  const id = randomUUID().slice(0, 8);
  const ownerEmail = `owner-${id}@test.local`;
  const password = 'owner password 123';
  const admin = await platform.adminUser.create({
    data: { email: `admin-${id}@test.local`, passwordHash: 'x', name: '[test]', role: 'ADMIN' },
  });
  const garage = await platform.garage.create({
    data: {
      name: `[test] Garage ${id}`,
      email: ownerEmail,
      phone: '+9610000000',
      locationText: 'Test',
      defaultLocale: 'en',
      status: 'ACTIVE',
      isPaid: true,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      createdByAdminId: admin.id,
      settings: { create: {} },
      branches: { create: { name: 'Main', code: 'BR1', isMain: true } },
    },
    include: { branches: true },
  });
  const owner = await platform.user.create({
    data: {
      garageId: garage.id,
      email: ownerEmail,
      name: 'Test Owner',
      role: 'OWNER',
      locale: 'en',
      passwordHash: await app.get(PasswordService).hash(password),
    },
  });
  return {
    garageId: garage.id,
    branchId: garage.branches[0]?.id as string,
    ownerId: owner.id,
    ownerEmail,
    password,
  };
}

/** Staff login; returns the Cookie header value for /v1 requests and the refresh token. */
export async function staffLogin(
  app: INestApplication,
  email: string,
  password: string,
): Promise<{ cookie: string; refreshToken: string }> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password })
    .expect(200);
  const c = cookiesOf(res);
  return { cookie: `gv_at=${c.gv_at}`, refreshToken: c.gv_rt as string };
}

/** The token from the newest invite or reset email sent to this user. */
export async function latestLinkToken(platform: PrismaClient, userId: string): Promise<string> {
  const n = await platform.notification.findFirstOrThrow({
    where: { userId, type: 'INVITE' },
    orderBy: { createdAt: 'desc' },
  });
  const link = new URL((n.payload as { link: string }).link);
  return link.searchParams.get('token') as string;
}

/** A fresh valid E.164 number (Lebanese mobile range 70), unique enough for one run. */
export function randomPhone(): string {
  return `+96170${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`;
}

/**
 * An active staff member with a password, created through the platform role, signed in.
 * Returns the Cookie header value.
 */
export async function signInAsStaff(
  app: INestApplication,
  garage: TestStaffGarage,
  role: 'MANAGER' | 'MECHANIC' | 'RECEPTIONIST',
): Promise<{ userId: string; cookie: string }> {
  const platform = app.get(PlatformDb).client;
  const email = `${role.toLowerCase()}-${randomUUID().slice(0, 8)}@test.local`;
  const password = 'staff password 123';
  const user = await platform.user.create({
    data: {
      garageId: garage.garageId,
      branchId: role === 'MANAGER' ? null : garage.branchId,
      email,
      name: `Test ${role}`,
      role,
      locale: 'en',
      passwordHash: await app.get(PasswordService).hash(password),
    },
  });
  const { cookie } = await staffLogin(app, email, password);
  return { userId: user.id, cookie };
}
