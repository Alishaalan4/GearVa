import type { ReactNode } from 'react';
import { PanelShell } from '@/components/panel-shell';

/** Pages behind sign-in. The API checks every request anyway; this only avoids empty screens. */
export default function PanelLayout({ children }: { children: ReactNode }) {
  return <PanelShell>{children}</PanelShell>;
}
