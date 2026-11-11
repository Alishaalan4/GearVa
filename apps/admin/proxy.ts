import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { forwardToApi } from './lib/forward-api';

const handleI18n = createMiddleware(routing);

/**
 * Next 16 "proxy" (formerly middleware): passes the visitor's IP on to the API, and adds
 * the /en or /ar prefix to page URLs.
 */
export default function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/admin/v1/')) return forwardToApi(request);
  return handleI18n(request);
}

export const config = {
  // Pages and the forwarded API (/admin/v1); not Next internals or files with an extension.
  matcher: ['/admin/v1/:path*', '/((?!admin/v1|_next|_vercel|.*\\..*).*)'],
};
