import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { z } from 'zod';

// Only the variables the API uses so far. Each step adds its own (README section 4).
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url(),
  PLATFORM_DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  // Only the console adapter exists until the first deployment (Phase 3).
  EMAIL_ADAPTER: z.enum(['console']).default('console'),
  EMAIL_FROM: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

/**
 * Reads the environment once at startup and refuses to start if it is wrong.
 * Locally the .env file sits at the repo root; on Render the variables come from the
 * environment group. Variables already set in the environment win over the file.
 */
export function loadEnv(): Env {
  // Parsed and copied by hand instead of process.loadEnvFile(): Jest gives each test
  // file its own process.env, which loadEnvFile() would not reach.
  const envFile = join(__dirname, '../../../../.env');
  if (existsSync(envFile)) {
    for (const [key, value] of Object.entries(parseEnv(readFileSync(envFile, 'utf8')))) {
      process.env[key] ??= value;
    }
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${problems.join('\n')}`);
  }
  return parsed.data;
}
