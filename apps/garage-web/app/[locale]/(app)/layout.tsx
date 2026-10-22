import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';

/** Pages behind sign-in. The API checks every request anyway; this only avoids empty screens. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
