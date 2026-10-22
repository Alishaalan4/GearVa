import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// The API this app talks to. Locally the API runs on port 4000; on Render, API_URL is set.
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  // Shared UI components are shipped as TypeScript source (packages/ui).
  transpilePackages: ['@gearva/ui'],
  // README 5.2: the browser only ever talks to this app. /admin/v1/* is forwarded to the
  // API, so login cookies belong to the admin site and no CORS is needed.
  async rewrites() {
    return [{ source: '/admin/v1/:path*', destination: `${apiUrl}/admin/v1/:path*` }];
  },
};

export default createNextIntlPlugin()(nextConfig);
