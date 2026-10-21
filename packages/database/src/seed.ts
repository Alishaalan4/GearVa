// npm run db:seed (database.md section 9). Safe to run again: existing rows are kept.
// Phase 1: the first SUPER_ADMIN, and in development a demo garage with an owner login.
// Service types and system settings come with the phases that use them.
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
        phone: '+961 1 000 000',
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
    await seedDemoGarage(db, adminId);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
