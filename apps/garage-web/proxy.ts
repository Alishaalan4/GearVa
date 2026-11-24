import { hasLocale } from 'next-intl';
import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { LOCALE_COOKIE, routing } from './i18n/routing';
import { forwardToApi } from './lib/forward-api';

const handleI18n = createMiddleware(routing);

/** The owner app endpoints this site forwards: its /owner/set-password and /delete-account pages post here. */
const OWNER_ENDPOINTS = ['/mobile/v1/auth/set-password', '/mobile/v1/auth/delete-account'];

/**
 * Step 7.9 (flow.md 11.6): one Next app answers two addresses. SITE_HOST (gearva.online) is
 * the public website, APP_HOST (app.gearva.online) the garage app. Unset (development,
 * tests): no split, every page on one address, as before.
 */
const SITE_HOST = process.env.SITE_HOST;
const APP_HOST = process.env.APP_HOST;

/** Website pages, after the /en or /ar prefix. Everything else belongs to the garage app. */
const WEBSITE_PAGES = ['/privacy', '/terms', '/support', '/delete-account', '/owner/'];

function isWebsitePage(path: string): boolean {
  return (
    path === '' ||
    path === '/' ||
    path === '/welcome' ||
    WEBSITE_PAGES.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`))
  );
}

/** The path without its /en or /ar prefix, and the prefix ('' when there is none). */
function splitLocale(pathname: string): { prefix: string; rest: string } {
  for (const l of routing.locales) {
    if (pathname === `/${l}` || pathname.startsWith(`/${l}/`)) {
      return { prefix: `/${l}`, rest: pathname.slice(l.length + 1) };
    }
  }
  return { prefix: '', rest: pathname };
}

/**
 * Sends a page to the address it belongs to, keeping the path and query (old links and
 * emails keep working; the browser keeps a #fragment such as the view-as code). On the
 * website, / shows the landing page and /welcome is an old name for it.
 */
function routeByHost(request: NextRequest): NextResponse | null {
  if (!SITE_HOST || !APP_HOST) return null;
  const host = (
    (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '').split(':')[0] ??
    ''
  ).toLowerCase();
  const onApp = host === APP_HOST;
  const { prefix, rest } = splitLocale(request.nextUrl.pathname);
  const website = isWebsitePage(rest);

  if (onApp && website && rest !== '' && rest !== '/') return moveTo(request, SITE_HOST);
  if (!onApp && !website) return moveTo(request, APP_HOST);
  if (!onApp && rest === '/welcome') {
    const url = request.nextUrl.clone();
    url.pathname = prefix || '/';
    return NextResponse.redirect(url, 308);
  }
  if (!onApp && prefix && (rest === '' || rest === '/')) {
    // The landing page at the root (/en, /ar), shown under that address. A bare / first
    // gets its language from the i18n step below.
    const url = request.nextUrl.clone();
    url.pathname = `${prefix}/welcome`;
    return NextResponse.rewrite(url);
  }
  return null;
}

function moveTo(request: NextRequest, host: string): NextResponse {
  const url = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${host}`);
  return NextResponse.redirect(url, 308);
}

/**
 * Next 16 "proxy" (formerly middleware): passes the visitor's IP on to the API, sends each
 * page to its address (website or garage app), and adds the /en or /ar prefix to page
 * URLs. A URL without one (such as the invite link /set-password?token=...) opens in the
 * language the person last chose with the language switch, or in English when they never
 * chose.
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/v1/') || OWNER_ENDPOINTS.includes(pathname)) {
    return forwardToApi(request);
  }
  const prefixed = routing.locales.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
  );
  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  if (!prefixed && hasLocale(routing.locales, saved) && saved !== routing.defaultLocale) {
    const url = request.nextUrl.clone();
    url.pathname = `/${saved}${pathname === '/' ? '' : pathname}`;
    return NextResponse.redirect(url);
  }
  return routeByHost(request) ?? handleI18n(request);
}

export const config = {
  // Pages and the forwarded API (/v1); not Next internals or files with an extension.
  matcher: ['/v1/:path*', '/((?!v1/|_next|_vercel|.*\\..*).*)'],
};
