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
  // README 5.2: the browser only ever talks to this app. /v1/* is forwarded to the API,
  // so login cookies belong to the garage site and no CORS is needed. The owner's
  // set-password page (flow.md 2.4) and the delete-account page (step 7.7) post to the two
  // owner app endpoints they need.
  async rewrites() {
    return [
      { source: '/v1/:path*', destination: `${apiUrl}/v1/:path*` },
      {
        source: '/mobile/v1/auth/set-password',
        destination: `${apiUrl}/mobile/v1/auth/set-password`,
      },
      {
        source: '/mobile/v1/auth/delete-account',
        destination: `${apiUrl}/mobile/v1/auth/delete-account`,
      },
    ];
  },
};

export default createNextIntlPlugin()(nextConfig);
