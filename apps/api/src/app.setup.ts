import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

/** App-level setup shared by main.ts and the tests, so both run the same stack. */
export function configureApp(app: NestExpressApplication): void {
  // Behind Render's proxy: use the real client IP for rate limits and audit rows.
  app.set('trust proxy', 1);
  // Auth cookies (README 5.2).
  app.use(cookieParser());
}
