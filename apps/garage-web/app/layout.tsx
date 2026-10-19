import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

// Phase 0 placeholder. next-intl, the [locale] segment and RTL arrive with the
// first real screens in Phase 1.
export const metadata: Metadata = {
  title: 'Gearva',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
