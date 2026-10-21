// npm run db:seed (database.md section 9). Safe to run again: existing rows are kept.
// Phase 1 seeds the first SUPER_ADMIN only. The demo garage comes with staff login
// (step 1.6); service types and system settings with the phases that use them.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { argon2id, hash } from 'argon2';
import { createPrismaClient } from './client';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

async function main(): Promise<void> {
  // dist/seed.js -> repo root .env (on Render the variables are already set).
  const envFile = join(__dirname, '../../../.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const email = required('SEED_ADMIN_EMAIL').toLowerCase();
  const password = required('SEED_ADMIN_PASSWORD');
  if (password.length < 12) throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');

  // admin_users is a platform table (database.md 6.1).
  const db = createPrismaClient(required('PLATFORM_DATABASE_URL'));
  try {
    const existing = await db.adminUser.findUnique({ where: { email } });
    if (existing) {
      console.log(`Super-admin ${email} already exists; left unchanged.`);
      return;
    }
    await db.adminUser.create({
      data: {
        email,
        name: 'Super admin',
        role: 'SUPER_ADMIN',
        passwordHash: await hash(password, { type: argon2id }),
      },
    });
    console.log(
      `Created super-admin ${email}. Two-factor authentication is optional: turn it on from Account in the admin app.`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
