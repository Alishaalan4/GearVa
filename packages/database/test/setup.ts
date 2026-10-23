import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { useTestEnvironment } from '../src/test-environment';

// Same rule as prisma.config.ts: the .env file at the repo root, if there is one.
// npm workspace scripts run with the package folder as the working directory.
const envFile = join(process.cwd(), '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

// gearva_test, recreated by `npm run test:prepare` before every run (README section 8).
useTestEnvironment();
