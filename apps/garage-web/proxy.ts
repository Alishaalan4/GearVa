import { hasLocale } from 'next-intl';
import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { LOCALE_COOKIE, routing } from './i18n/routing';

const handleI18n = createMiddleware(routing);

/**
 * Next 16 "proxy" (formerly middleware): adds the /en or /ar prefix to page URLs. A URL
 * without one (such as the invite link /set-password?token=...) opens in the language the
 * person last chose with the language switch, or in English when they never chose.
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const prefixed = routing.locales.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
  );
  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  if (!prefixed && hasLocale(routing.locales, saved) && saved !== routing.defaultLocale) {
    const url = request.nextUrl.clone();
    url.pathname = `/${saved}${pathname === '/' ? '' : pathname}`;
    return NextResponse.redirect(url);
  }
  return handleI18n(request);
}

export const config = {
  // Not for the forwarded API (/v1), Next internals or files with an extension.
  matcher: ['/((?!v1/|_next|_vercel|.*\\..*).*)'],
};
