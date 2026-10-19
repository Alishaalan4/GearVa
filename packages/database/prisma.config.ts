import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 does not load .env itself. Locally it lives at the repo root;
// on Render the variables come from the environment group instead.
const envFile = join(__dirname, '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Migrations run as gearva_migrator (database.md section 6.1).
    url: env('MIGRATION_DATABASE_URL'),
  },
});
