import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { z } from 'zod';

/** An optional variable; `NAME=` with nothing after it (as in .env.example) counts as unset. */
const unsetIfEmpty = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

// Only the variables the API uses so far. Each step adds its own (README section 4).
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.url(),
    PLATFORM_DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    // `console` prints emails (development, tests); `resend` sends them (production).
    EMAIL_ADAPTER: z.enum(['console', 'resend']).default('console'),
    EMAIL_FROM: z.string().min(1),
    RESEND_API_KEY: unsetIfEmpty(z.string()),
    // `local` keeps files in a folder (development, tests); `s3` in Cloudflare R2 (production).
    FILES_ADAPTER: z.enum(['local', 's3']).default('local'),
    FILES_LOCAL_DIR: z.string().min(1).default('.storage'),
    S3_ENDPOINT: unsetIfEmpty(z.url()),
    S3_BUCKET: unsetIfEmpty(z.string()),
    S3_ACCESS_KEY: unsetIfEmpty(z.string()),
    S3_SECRET_KEY: unsetIfEmpty(z.string()),
    // Shared with the two web apps. A request carrying it comes through their forwarding,
    // so its x-gearva-client-ip header is the visitor's address (README 9). Empty: off.
    PROXY_SECRET: unsetIfEmpty(z.string().min(32)),
    // Redis key prefix of the BullMQ queues (BullMQ's default). A test that swaps a
    // notification channel uses its own, so other test files' workers never take its jobs.
    QUEUE_PREFIX: z.string().min(1).default('bull'),
    // Hourly jobs: the reminder scan (flow.md 9.1) and the garage expiry pass (2.5).
    // Off in tests, which run them themselves.
    SCHEDULED_JOBS: z.enum(['on', 'off']).default('on'),
    // First wait before a failed notification is tried again (doubled each time).
    NOTIFICATION_RETRY_DELAY_MS: z.coerce.number().int().positive().default(30_000),
    // `stub` is for tests, which have no Chrome.
    PDF_ADAPTER: z.enum(['puppeteer', 'stub']).default('puppeteer'),
    // Base URL of garage-web: invite and password-reset links point there.
    APP_URL_GARAGE: z.url(),
    // Signs the 15-minute access tokens (and the 5-minute 2FA challenge).
    JWT_ACCESS_SECRET: z.string().min(1),
    // Encrypts admin_users.totpSecretEnc with AES-256-GCM.
    TOTP_ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, {
      message: 'must be 32 random bytes in base64 (see README section 4)',
    }),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.JWT_ACCESS_SECRET.length < 32) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'must be at least 32 characters in production',
      });
    }
    const missing = (name: keyof typeof env, when: string) => {
      if (!env[name])
        ctx.addIssue({ code: 'custom', path: [name], message: `is required ${when}` });
    };
    if (env.NODE_ENV === 'production') missing('PROXY_SECRET', 'in production');
    if (env.EMAIL_ADAPTER === 'resend') missing('RESEND_API_KEY', 'with EMAIL_ADAPTER=resend');
    if (env.FILES_ADAPTER === 's3') {
      for (const name of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const) {
        missing(name, 'with FILES_ADAPTER=s3');
      }
    }
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
