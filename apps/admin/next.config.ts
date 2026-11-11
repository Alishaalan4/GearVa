import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// The API this app talks to. Locally the API runs on port 4000; on Render, API_URL is set.
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

// README 9: no framing (clickjacking), no MIME sniffing, no full URLs (with tokens) sent to
// other sites, and HTTPS only once a browser has seen the site over HTTPS.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  // Render runs the app behind its own proxy; no "X-Powered-By: Next.js".
  poweredByHeader: false,
  // Shared UI components are shipped as TypeScript source (packages/ui).
  transpilePackages: ['@gearva/ui'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // README 5.2: the browser only ever talks to this app. /admin/v1/* is forwarded to the
  // API, so login cookies belong to the admin site and no CORS is needed.
  async rewrites() {
    return [{ source: '/admin/v1/:path*', destination: `${apiUrl}/admin/v1/:path*` }];
  },
};

export default createNextIntlPlugin()(nextConfig);
