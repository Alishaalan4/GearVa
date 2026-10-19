// Guard rails for tenant isolation at the database level (database.md section 6.5).
// Runs against the real local Postgres with the real roles.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../src/client';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { TENANT_ROOT_TABLE, TENANT_TABLES } from '../src/tenant-tables';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (copy .env.example to .env)`);
  return value;
}

let app: PrismaClient;
let platform: PrismaClient;

beforeAll(() => {
  app = createPrismaClient(requireEnv('DATABASE_URL'));
  platform = createPrismaClient(requireEnv('PLATFORM_DATABASE_URL'));
});

afterAll(async () => {
  await app?.$disconnect();
  await platform?.$disconnect();
});

/** Runs `fn` as gearva_app inside a transaction with app.garage_id set, like the API will. */
function asGarage<T>(garageId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return app.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.garage_id', ${garageId}, true)`;
    return fn(tx);
  });
}

describe('RLS coverage', () => {
  it('tenant-tables.ts lists exactly the tables that have a garage_id column', async () => {
    const rows = await platform.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'garage_id'`;
    const inDatabase = rows.map((r) => r.table_name).sort();
    expect(inDatabase).toEqual([...TENANT_TABLES].sort());
  });

  it('every tenant table has RLS enabled, forced, and a tenant_isolation policy', async () => {
    const tables = [TENANT_ROOT_TABLE, ...TENANT_TABLES];
    const rows = await platform.$queryRaw<
      { relname: string; enabled: boolean; forced: boolean; has_policy: boolean }[]
    >`
      SELECT c.relname,
             c.relrowsecurity AS enabled,
             c.relforcerowsecurity AS forced,
             EXISTS (SELECT 1 FROM pg_policies p
                     WHERE p.schemaname = 'public' AND p.tablename = c.relname
                       AND p.policyname = 'tenant_isolation') AS has_policy
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY(${tables})`;

    expect(rows).toHaveLength(tables.length);
    for (const row of rows) {
      expect(row, row.relname).toMatchObject({ enabled: true, forced: true, has_policy: true });
    }
  });
});

describe('RLS behavior', () => {
  const adminId = randomUUID();
  const garageA = randomUUID();
  const garageB = randomUUID();

  beforeAll(async () => {
    // gearva_platform bypasses RLS, like the admin module does.
    await platform.adminUser.create({
      data: {
        id: adminId,
        email: `rls-${adminId}@test.local`,
        passwordHash: 'x',
        name: 'RLS test',
        role: 'ADMIN',
      },
    });
    for (const id of [garageA, garageB]) {
      await platform.garage.create({
        data: {
          id,
          name: `Garage ${id}`,
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
  });

  afterAll(async () => {
    await platform.branch.deleteMany({ where: { garageId: { in: [garageA, garageB] } } });
    await platform.garage.deleteMany({ where: { id: { in: [garageA, garageB] } } });
    await platform.adminUser.delete({ where: { id: adminId } });
  });

  it('without a tenant context, the app role sees nothing', async () => {
    expect(await app.garage.count({ where: { id: { in: [garageA, garageB] } } })).toBe(0);
    expect(await app.branch.count({ where: { garageId: { in: [garageA, garageB] } } })).toBe(0);
  });

  it('with garage A as context, the app role sees only garage A', async () => {
    const [garages, branches] = await asGarage(
      garageA,
      async (tx) =>
        [
          await tx.garage.findMany({ where: { id: { in: [garageA, garageB] } } }),
          await tx.branch.findMany({ where: { garageId: { in: [garageA, garageB] } } }),
        ] as const,
    );
    expect(garages.map((g) => g.id)).toEqual([garageA]);
    expect(branches.map((b) => b.garageId)).toEqual([garageA]);
  });

  it('garage A cannot write a row into garage B', async () => {
    await expect(
      asGarage(garageA, (tx) =>
        tx.branch.create({ data: { garageId: garageB, name: 'Sneaky', code: 'BR9' } }),
      ),
    ).rejects.toThrow();
  });

  it('garage A cannot update or delete garage B rows (they are invisible)', async () => {
    const result = await asGarage(garageA, async (tx) => ({
      updated: await tx.branch.updateMany({
        where: { garageId: garageB },
        data: { name: 'Hacked' },
      }),
      deleted: await tx.branch.deleteMany({ where: { garageId: garageB } }),
    }));
    expect(result.updated.count).toBe(0);
    expect(result.deleted.count).toBe(0);
  });

  it('the app role cannot update or delete audit rows', async () => {
    await expect(
      asGarage(garageA, (tx) => tx.$executeRaw`UPDATE audit_logs SET action = 'x'`),
    ).rejects.toThrow(/permission denied/);
    await expect(asGarage(garageA, (tx) => tx.$executeRaw`DELETE FROM audit_logs`)).rejects.toThrow(
      /permission denied/,
    );
  });
});
