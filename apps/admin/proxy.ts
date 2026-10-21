import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Next 16 "proxy" (formerly middleware): adds the /en or /ar prefix to page URLs.
export default createMiddleware(routing);

export const config = {
  // Not for the forwarded API (/admin/v1), Next internals or files with an extension.
  matcher: ['/((?!admin/v1|_next|_vercel|.*\\..*).*)'],
};
