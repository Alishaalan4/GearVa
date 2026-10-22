import type { ReactNode } from 'react';
import { OwnerOnly } from '@/components/owner-only';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <OwnerOnly>{children}</OwnerOnly>;
}
