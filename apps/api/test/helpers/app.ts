import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

/** The real app with the same setup as main.ts, plus optional test-only controllers. */
export async function createTestApp(controllers: Type[] = []): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}

/** name -> value of the cookies a response sets (an empty value means "cleared"). */
export function cookiesOf(res: { headers: Record<string, unknown> }): Record<string, string> {
  const header = res.headers['set-cookie'];
  const lines = Array.isArray(header) ? (header as string[]) : [];
  return Object.fromEntries(
    lines.map((line) => {
      const pair = line.split(';', 1)[0] ?? '';
      const eq = pair.indexOf('=');
      return [pair.slice(0, eq), decodeURIComponent(pair.slice(eq + 1))];
    }),
  );
}
