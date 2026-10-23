// npm run test:prepare -w @gearva/database (run by the root `test` and `test:tenancy`).
// Drops and recreates the test database (gearva -> gearva_test), then applies every
// migration to it, so each test run starts from an empty database with the real schema,
// roles and RLS policies (README section 8). Never touches the development database.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createPrismaClient } from '../client';
import { toTestDatabaseUrl } from '../test-environment';

const packageRoot = join(__dirname, '../..');
const envFile = join(packageRoot, '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function main(): Promise<void> {
  const migratorUrl = process.env.MIGRATION_DATABASE_URL;
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL is not set (copy .env.example to .env)');
  const testUrl = toTestDatabaseUrl(migratorUrl);
  const name = decodeURIComponent(new URL(testUrl).pathname.slice(1));
  if (!/^[a-z0-9_]+_test$/.test(name)) throw new Error(`Refusing to recreate "${name}"`);

  // gearva_migrator has CREATEDB locally (docker-init.sh) and in CI (.github/workflows/ci.yml).
  const server = createPrismaClient(migratorUrl);
  try {
    await server.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
    await server.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await server.$disconnect();
  }

  // The schema grant from bootstrap-roles.sql; the migrations grant the tables.
  const test = createPrismaClient(testUrl);
  try {
    await test.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO gearva_app, gearva_platform');
  } finally {
    await test.$disconnect();
  }

  const prismaCli = join(dirname(require.resolve('prisma/package.json')), 'build/index.js');
  const migrate = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: packageRoot,
    stdio: 'inherit',
    env: { ...process.env, MIGRATION_DATABASE_URL: testUrl },
  });
  if (migrate.status !== 0) throw new Error('prisma migrate deploy failed on the test database');
  console.log(`Test database "${name}" is ready.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
