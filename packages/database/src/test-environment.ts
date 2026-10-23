// Tests run on their own database and Redis database (README section 8), so a test run
// never touches development data and a running `npm run dev` never picks up test jobs.

/** The three connection variables (database.md section 6.1). */
export const DATABASE_URL_VARS = [
  'DATABASE_URL',
  'MIGRATION_DATABASE_URL',
  'PLATFORM_DATABASE_URL',
] as const;

const TEST_SUFFIX = '_test';
/** Redis database for tests; development uses database 0. */
const TEST_REDIS_DB = '1';

/** The same connection URL, pointing at the test database: .../gearva -> .../gearva_test */
export function toTestDatabaseUrl(url: string): string {
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname.slice(1));
  if (!name) throw new Error(`No database name in ${parsed.protocol}//${parsed.host}`);
  if (!name.endsWith(TEST_SUFFIX)) parsed.pathname = `/${name}${TEST_SUFFIX}`;
  return parsed.toString();
}

/**
 * Points this process at the test database and Redis database. Call it in test setup,
 * after the .env file is loaded and before anything connects.
 */
export function useTestEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  for (const name of DATABASE_URL_VARS) {
    const value = env[name];
    if (!value) throw new Error(`${name} is not set (copy .env.example to .env)`);
    env[name] = toTestDatabaseUrl(value);
  }
  if (env.REDIS_URL) {
    const redis = new URL(env.REDIS_URL);
    redis.pathname = `/${TEST_REDIS_DB}`;
    env.REDIS_URL = redis.toString();
  }
  env.NODE_ENV = 'test';
}
