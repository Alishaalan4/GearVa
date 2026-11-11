import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { ENV, type Env } from './config/env';

export const PROXY_SECRET_HEADER = 'x-gearva-proxy-secret';
export const CLIENT_IP_HEADER = 'x-gearva-client-ip';

/** App-level setup shared by main.ts and the tests, so both run the same stack. */
export function configureApp(app: NestExpressApplication): void {
  // Behind Render's proxy: req.ip is the address that proxy saw (the last X-Forwarded-For).
  app.set('trust proxy', 1);
  app.use(forwardedClientIp(app.get<Env>(ENV).PROXY_SECRET));
  // Auth cookies (README 5.2).
  app.use(cookieParser());
}

/**
 * Browsers reach the API through the web apps' forwarding, so Render's proxy sees the web
 * app, not the visitor (README 9, "Real client IPs"). The web apps send the visitor's
 * address in x-gearva-client-ip together with the shared PROXY_SECRET. Only then is it
 * used: it replaces X-Forwarded-For, so req.ip (rate limits, audit rows, sessions) is the
 * visitor. Without the secret the header is ignored, so nobody can choose their own IP.
 */
export function forwardedClientIp(secret: string | undefined) {
  const expected = secret ? Buffer.from(secret) : null;
  return (req: Request, _res: Response, next: NextFunction) => {
    const given = req.headers[PROXY_SECRET_HEADER];
    const ip = req.headers[CLIENT_IP_HEADER];
    delete req.headers[PROXY_SECRET_HEADER];
    delete req.headers[CLIENT_IP_HEADER];
    const givenBytes = typeof given === 'string' ? Buffer.from(given) : null;
    if (
      expected &&
      givenBytes?.length === expected.length &&
      timingSafeEqual(givenBytes, expected) &&
      typeof ip === 'string' &&
      isIP(ip)
    ) {
      req.headers['x-forwarded-for'] = ip;
    }
    next();
  };
}
