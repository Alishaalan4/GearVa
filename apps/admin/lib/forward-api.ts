import { type NextRequest, NextResponse } from 'next/server';

/**
 * README 9 ("Real client IPs"): the API sees this app, not the visitor, because API
 * calls are forwarded by next.config.ts rewrites. So the visitor's address goes along in
 * x-gearva-client-ip, with the shared PROXY_SECRET that tells the API to trust it.
 * Render's edge is Cloudflare, which sets cf-connecting-ip itself; the last
 * X-Forwarded-For entry (added by Render, not the browser) is the fallback.
 * Without PROXY_SECRET (local development) the request is forwarded unchanged.
 */
export function forwardToApi(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.delete('x-gearva-proxy-secret');
  headers.delete('x-gearva-client-ip');
  const secret = process.env.PROXY_SECRET;
  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  if (secret && ip) {
    headers.set('x-gearva-proxy-secret', secret);
    headers.set('x-gearva-client-ip', ip);
  }
  return NextResponse.next({ request: { headers } });
}
