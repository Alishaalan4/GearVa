// npm run db:reset (local development only). Empties the development database and
// applies every migration again; the `reset` script then runs the seed.
//
// Not `prisma migrate reset`: it drops and recreates the `public` schema, which needs the
// CREATE right on the database, and the new schema would lack the USAGE grant of the two
// app roles (bootstrap-roles.sql). This checks the right first, so it never leaves the
// database without a schema, and restores the grant like prepare-test-db.ts.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createPrismaClient } from '../client';

const packageRoot = join(__dirname, '../..');
const envFile = join(packageRoot, '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

async function main(): Promise<void> {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL is not set (copy .env.example to .env)');
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname.slice(1));
  if (!LOCAL_HOSTS.has(parsed.hostname) || process.env.NODE_ENV === 'production') {
    throw new Error(`Refusing to reset "${name}" on ${parsed.hostname}: local development only`);
  }

  const db = createPrismaClient(url);
  try {
    const [row] = await db.$queryRawUnsafe<{ allowed: boolean }[]>(
      `SELECT has_database_privilege(current_database(), 'CREATE') AS allowed`,
    );
    if (!row?.allowed) {
      throw new Error(
        `gearva_migrator may not create a schema in "${name}", so nothing was changed. ` +
          'Give it the right once (docker-init.sh does this for new volumes):\n' +
          `  docker compose exec postgres psql -U postgres -d ${name} -c "GRANT CREATE ON DATABASE ${name} TO gearva_migrator"`,
      );
    }
    await db.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await db.$executeRawUnsafe('CREATE SCHEMA public');
    // The schema grant from bootstrap-roles.sql; the migrations grant the tables.
    await db.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO gearva_app, gearva_platform');
  } finally {
    await db.$disconnect();
  }

  const prismaCli = join(dirname(require.resolve('prisma/package.json')), 'build/index.js');
  const migrate = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: packageRoot,
    stdio: 'inherit',
  });
  if (migrate.status !== 0) throw new Error('prisma migrate deploy failed');
  console.log(`Database "${name}" is empty and up to date; seeding next.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
