import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@gearva/database';

export interface TestGarages {
  adminId: string;
  garageA: string;
  garageB: string;
}

/**
 * Two garages with one branch each, created through the platform role like the admin
 * module does. Names start with "[test]". Tests run on their own database (test/setup.ts),
 * recreated before every run, so nothing needs cleaning up.
 */
export async function createTestGarages(platform: PrismaClient): Promise<TestGarages> {
  const adminId = randomUUID();
  const garageA = randomUUID();
  const garageB = randomUUID();

  await platform.adminUser.create({
    data: {
      id: adminId,
      email: `test-${adminId}@test.local`,
      passwordHash: 'x',
      name: '[test]',
      role: 'ADMIN',
    },
  });
  for (const id of [garageA, garageB]) {
    await platform.garage.create({
      data: {
        id,
        name: `[test] ${id}`,
        email: `${id}@test.local`,
        phone: '+9610000000',
        locationText: 'Test',
        defaultLocale: 'en',
        status: 'ACTIVE',
        createdByAdminId: adminId,
        branches: { create: { name: 'Main', code: 'BR1', isMain: true } },
      },
    });
  }
  return { adminId, garageA, garageB };
}

/** Polls until `check` returns a value, or fails after `timeoutMs`. */
export async function waitFor<T>(
  check: () => Promise<T | null | undefined>,
  timeoutMs = 5000,
): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeoutMs)
      throw new Error(`waitFor timed out after ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
