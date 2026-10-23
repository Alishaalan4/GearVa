// Runs before every test file (jest.setupFiles). Tests use their own database and Redis
// database (README section 8): gearva_test, recreated by `npm run test:prepare` before
// every run, so development data is never touched.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { useTestEnvironment } from '@gearva/database/test-environment';

// Same as loadEnv() in src/config/env.ts: the repo-root .env fills what is not set yet.
const envFile = join(__dirname, '../../../.env');
if (existsSync(envFile)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(envFile, 'utf8')))) {
    process.env[key] ??= value;
  }
}
useTestEnvironment();
