'use client';

import type { StaffRole } from '@gearva/contracts';
import { Alert } from '@gearva/ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useStaff } from '@/features/auth/use-staff';

/** Like OwnerOnly, for pages that several roles may open (flow.md 1). The API checks too. */
export function RolesOnly({ roles, children }: { roles: StaffRole[]; children: ReactNode }) {
  const t = useTranslations('common');
  const staff = useStaff();
  if (!staff.data) return null;
  if (!roles.includes(staff.data.role)) return <Alert>{t('notAllowed')}</Alert>;
  return <>{children}</>;
}
