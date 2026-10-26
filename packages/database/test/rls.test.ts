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

  // No cleanup: the test database is recreated before every run (README section 8).

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

// Phase 2 (step 2.1): owners, global service types, garage-scoped foreign keys, and the
// "never deleted" grants (database.md 4.3, 4.4, 6.6).
describe('Phase 2 tables', () => {
  const adminId = randomUUID();
  const garageA = randomUUID();
  const garageB = randomUUID();
  /** A fresh valid E.164 number (Lebanese mobile range 70). */
  const newPhone = () => `+96170${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`;

  const ownerIdFor = (garageId: string, phone: string) =>
    asGarage(garageId, async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT find_or_create_owner(${phone}, 'Test Owner', 'en') AS id`;
      return rows[0]?.id as string;
    });

  beforeAll(async () => {
    await platform.adminUser.create({
      data: {
        id: adminId,
        email: `p2-${adminId}@test.local`,
        passwordHash: 'x',
        name: 'P2',
        role: 'ADMIN',
      },
    });
    for (const id of [garageA, garageB]) {
      await platform.garage.create({
        data: {
          id,
          name: `Garage ${id}`,
          email: `${id}@test.local`,
          phone: '+9611000000',
          locationText: 'Test',
          defaultLocale: 'en',
          status: 'ACTIVE',
          createdByAdminId: adminId,
        },
      });
    }
  });

  describe('owners (linked-only access)', () => {
    it('find_or_create_owner returns one id per phone, from any garage', async () => {
      const phone = newPhone();
      const first = await ownerIdFor(garageA, phone);
      expect(first).toMatch(/^[0-9a-f-]{36}$/);
      // UUID v7: the version nibble is 7.
      expect(first[14]).toBe('7');
      expect(await ownerIdFor(garageA, phone)).toBe(first);
      expect(await ownerIdFor(garageB, phone)).toBe(first);
    });

    it('it refuses bad input and needs a tenant context', async () => {
      await expect(ownerIdFor(garageA, '03123456')).rejects.toThrow(/E\.164/);
      await expect(
        app.$queryRaw`SELECT find_or_create_owner(${newPhone()}, 'X', 'en')`,
      ).rejects.toThrow(/tenant context/);
    });

    it('a garage sees an owner only once it has them as a customer', async () => {
      const ownerId = await ownerIdFor(garageA, newPhone());
      const seen = (garageId: string) =>
        asGarage(garageId, (tx) => tx.owner.count({ where: { id: ownerId } }));
      expect(await seen(garageA)).toBe(0);

      await asGarage(garageA, (tx) =>
        tx.garageCustomer.create({ data: { garageId: garageA, ownerId, name: 'Customer A' } }),
      );
      expect(await seen(garageA)).toBe(1);
      expect(await seen(garageB)).toBe(0);
      // And never all owners: without a context nothing at all.
      expect(await app.owner.count()).toBe(0);
    });

    it('garage code cannot write owners directly', async () => {
      await expect(
        asGarage(garageA, (tx) =>
          tx.owner.create({ data: { phone: newPhone(), name: 'Direct', locale: 'en' } }),
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe('service_types (global defaults + garage overrides)', () => {
    const code = `T_${randomUUID().slice(0, 8)}`;
    let globalId: string;

    beforeAll(async () => {
      const base = { code, nameAr: 'اختبار', nameEn: 'Test', defaultIntervalKm: 5000 };
      // Inactive: the API tests run at the same time on the same test database and list
      // the active global types; an extra one would appear in every garage.
      globalId = (await platform.serviceType.create({ data: { ...base, isActive: false } })).id;
      await platform.serviceType.create({
        data: { ...base, garageId: garageA, defaultIntervalKm: 7000 },
      });
      await platform.serviceType.create({
        data: { ...base, garageId: garageB, defaultIntervalKm: 9000 },
      });
    });

    it("a garage reads the global row and its own override, never another garage's", async () => {
      const rows = await asGarage(garageA, (tx) =>
        tx.serviceType.findMany({ where: { code }, orderBy: { defaultIntervalKm: 'asc' } }),
      );
      expect(rows.map((r) => [r.garageId, r.defaultIntervalKm])).toEqual([
        [null, 5000],
        [garageA, 7000],
      ]);
    });

    it('a garage cannot change or add global rows', async () => {
      const updated = await asGarage(garageA, (tx) =>
        tx.serviceType.updateMany({ where: { id: globalId }, data: { defaultIntervalKm: 1 } }),
      );
      expect(updated.count).toBe(0);
      await expect(
        asGarage(garageA, (tx) =>
          tx.serviceType.create({ data: { code: `${code}_2`, nameAr: 'x', nameEn: 'x' } }),
        ),
      ).rejects.toThrow();
    });

    it('a code is unique among global rows', async () => {
      await expect(
        platform.serviceType.create({ data: { code, nameAr: 'x', nameEn: 'x' } }),
      ).rejects.toThrow(/Unique constraint/);
    });
  });

  describe('garage-scoped foreign keys', () => {
    it("a row of garage A can never point to garage B's customer", async () => {
      const ownerId = await ownerIdFor(garageB, newPhone());
      const customerB = await asGarage(garageB, (tx) =>
        tx.garageCustomer.create({ data: { garageId: garageB, ownerId, name: 'Customer B' } }),
      );
      // Even through the platform role (no RLS), the database refuses the cross link.
      await expect(
        platform.vehicle.create({
          data: {
            garageId: garageA,
            garageCustomerId: customerB.id,
            ownerId,
            plate: 'B 123',
            plateNormalized: 'B123',
            make: 'Kia',
            model: 'Rio',
            currentKm: 1000,
          },
        }),
      ).rejects.toThrow(/Foreign key constraint/);
    });

    it('a plate is unique per garage among cars that are not deleted', async () => {
      const ownerId = await ownerIdFor(garageA, newPhone());
      const customer = await asGarage(garageA, (tx) =>
        tx.garageCustomer.create({ data: { garageId: garageA, ownerId, name: 'Plates' } }),
      );
      const car = {
        garageId: garageA,
        garageCustomerId: customer.id,
        ownerId,
        plate: 'P 1',
        plateNormalized: `P${randomUUID().slice(0, 6).toUpperCase()}`,
        make: 'Kia',
        model: 'Rio',
        currentKm: 0,
      };
      const first = await asGarage(garageA, (tx) => tx.vehicle.create({ data: car }));
      await expect(asGarage(garageA, (tx) => tx.vehicle.create({ data: car }))).rejects.toThrow();
      // After a soft delete the plate can be used again.
      await asGarage(garageA, (tx) =>
        tx.vehicle.update({ where: { id: first.id }, data: { deletedAt: new Date() } }),
      );
      await asGarage(garageA, (tx) => tx.vehicle.create({ data: car }));
      // Negative odometer is refused by a CHECK constraint.
      await expect(
        asGarage(garageA, (tx) =>
          tx.vehicle.create({ data: { ...car, plateNormalized: 'NEG1', currentKm: -1 } }),
        ),
      ).rejects.toThrow();
    });
  });

  it('records, visits, customers and vehicles are never deleted by the app role', async () => {
    for (const table of [
      'garage_customers',
      'vehicles',
      'visits',
      'service_records',
      'reminders',
    ]) {
      await expect(
        asGarage(garageA, (tx) => tx.$executeRawUnsafe(`DELETE FROM "${table}"`)),
        table,
      ).rejects.toThrow(/permission denied/);
    }
  });
});
