// npm run db:seed (database.md section 9). Safe to run again: existing rows are kept.
// Phase 1: the first SUPER_ADMIN, and in development a demo garage with an owner login.
// Phase 2: the global service types. System settings come with the phases that use them.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { argon2id, hash } from 'argon2';
import { createPrismaClient } from './client';
import type { PrismaClient } from './generated/prisma/client';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

function hashPassword(password: string): Promise<string> {
  return hash(password, { type: argon2id });
}

async function seedSuperAdmin(db: PrismaClient): Promise<string> {
  const email = required('SEED_ADMIN_EMAIL').toLowerCase();
  const password = required('SEED_ADMIN_PASSWORD');
  if (password.length < 12) throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');

  const existing = await db.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`Super-admin ${email} already exists; left unchanged.`);
    return existing.id;
  }
  const admin = await db.adminUser.create({
    data: {
      email,
      name: 'Super admin',
      role: 'SUPER_ADMIN',
      passwordHash: await hashPassword(password),
    },
  });
  console.log(
    `Created super-admin ${email}. Two-factor authentication is optional: turn it on from Account in the admin app.`,
  );
  return admin.id;
}

/**
 * Global service types with the starting intervals of database.md 4.4 (confirmed
 * 2026-10-23). Garages override them with their own rows; admins manage them in Phase 5.
 * `detailKey` names the Zod schema for ServiceRecord.details (null = no extra fields).
 */
const SERVICE_TYPES: {
  code: string;
  nameEn: string;
  nameAr: string;
  km: number | null;
  mi: number | null;
  months: number | null;
  detailKey: string | null;
}[] = [
  {
    code: 'OIL_CHANGE',
    nameEn: 'Oil change',
    nameAr: 'تغيير زيت المحرك',
    km: 5000,
    mi: 3600,
    months: 6,
    detailKey: 'oil',
  },
  {
    code: 'WHEELS',
    nameEn: 'Wheels (rotation)',
    nameAr: 'الإطارات (تبديل)',
    km: 10000,
    mi: 6000,
    months: 6,
    detailKey: 'wheels',
  },
  {
    code: 'STEERING_OIL',
    nameEn: 'Steering oil',
    nameAr: 'زيت المقود',
    km: 40000,
    mi: 25000,
    months: 24,
    detailKey: 'oil',
  },
  {
    code: 'TRANSMISSION_OIL',
    nameEn: 'Transmission oil',
    nameAr: 'زيت ناقل الحركة',
    km: 60000,
    mi: 40000,
    months: 36,
    detailKey: 'oil',
  },
  {
    code: 'DIFFERENTIAL_OIL',
    nameEn: 'Differential oil',
    nameAr: 'زيت الدفرنسيال',
    km: 60000,
    mi: 40000,
    months: 36,
    detailKey: 'oil',
  },
  {
    code: 'GEAR_OIL',
    nameEn: 'Gear oil',
    nameAr: 'زيت الجير',
    km: 40000,
    mi: 25000,
    months: 24,
    detailKey: 'oil',
  },
  {
    code: 'BRAKES',
    nameEn: 'Brakes',
    nameAr: 'الفرامل',
    km: 30000,
    mi: 20000,
    months: 12,
    detailKey: 'brakes',
  },
  {
    code: 'BATTERY',
    nameEn: 'Battery',
    nameAr: 'البطارية',
    km: null,
    mi: null,
    months: 24,
    detailKey: 'battery',
  },
  {
    code: 'AC',
    nameEn: 'Air conditioning',
    nameAr: 'المكيّف',
    km: null,
    mi: null,
    months: 12,
    detailKey: 'ac',
  },
  {
    code: 'ENGINE',
    nameEn: 'Engine',
    nameAr: 'المحرك',
    km: null,
    mi: null,
    months: null,
    detailKey: null,
  },
  {
    code: 'OTHER',
    nameEn: 'Other',
    nameAr: 'خدمة أخرى',
    km: null,
    mi: null,
    months: null,
    detailKey: null,
  },
];

async function seedServiceTypes(db: PrismaClient): Promise<void> {
  const existing = await db.serviceType.findMany({
    where: { garageId: null },
    select: { code: true },
  });
  const have = new Set(existing.map((t) => t.code));
  const missing = SERVICE_TYPES.filter((t) => !have.has(t.code));
  await db.serviceType.createMany({
    data: missing.map((t) => ({
      code: t.code,
      nameEn: t.nameEn,
      nameAr: t.nameAr,
      defaultIntervalKm: t.km,
      defaultIntervalMi: t.mi,
      defaultIntervalMonths: t.months,
      detailKey: t.detailKey,
      sortOrder: SERVICE_TYPES.indexOf(t) * 10,
    })),
  });
  console.log(
    missing.length > 0
      ? `Created ${missing.length} global service types.`
      : 'Global service types already exist; left unchanged.',
  );
}

/**
 * Development only: "Demo Garage" (paid for a year) with two branches and an OWNER who
 * can sign in at once with SEED_DEMO_OWNER_EMAIL / SEED_DEMO_OWNER_PASSWORD.
 * Skipped in production or when those variables are empty.
 */
async function seedDemoGarage(db: PrismaClient, adminId: string): Promise<void> {
  const email = process.env.SEED_DEMO_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_DEMO_OWNER_PASSWORD?.trim();
  if (process.env.NODE_ENV === 'production' || !email || !password) {
    console.log('Demo garage skipped (production, or SEED_DEMO_OWNER_* not set).');
    return;
  }
  if (password.length < 10)
    throw new Error('SEED_DEMO_OWNER_PASSWORD must be at least 10 characters');

  if (await db.user.findUnique({ where: { email } })) {
    console.log(`Demo owner ${email} already exists; left unchanged.`);
    return;
  }
  const passwordHash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    const garage = await tx.garage.create({
      data: {
        name: 'Demo Garage',
        email,
        phone: '+9611000000',
        locationText: 'Beirut',
        defaultLocale: 'ar',
        status: 'ACTIVE',
        isPaid: true,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        createdByAdminId: adminId,
        settings: { create: {} },
        branches: {
          create: [
            { name: 'Demo Garage — Main', code: 'BR1', isMain: true },
            { name: 'Demo Garage — Branch 2', code: 'BR2' },
          ],
        },
      },
    });
    await tx.user.create({
      data: {
        garageId: garage.id,
        email,
        name: 'Demo Owner',
        role: 'OWNER',
        locale: 'ar',
        passwordHash,
      },
    });
  });
  console.log(`Created Demo Garage. Owner login: ${email} (garage app).`);
}

async function main(): Promise<void> {
  // dist/seed.js -> repo root .env (on Render the variables are already set).
  const envFile = join(__dirname, '../../../.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  // Platform role: admin_users is a platform table, and the demo garage is created the
  // way the admin module creates garages (database.md 6.1).
  const db = createPrismaClient(required('PLATFORM_DATABASE_URL'));
  try {
    const adminId = await seedSuperAdmin(db);
    await seedServiceTypes(db);
    await seedDemoGarage(db, adminId);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
