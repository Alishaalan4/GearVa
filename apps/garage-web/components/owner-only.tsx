'use client';

import { Alert } from '@gearva/ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useStaff } from '@/features/auth/use-staff';

/**
 * flow.md 1: staff, branches and garage settings are for the OWNER. The API refuses
 * everyone else anyway; this only avoids showing them a broken page.
 */
export function OwnerOnly({ children }: { children: ReactNode }) {
  const t = useTranslations('common');
  const staff = useStaff();
  if (!staff.data) return null;
  if (staff.data.role !== 'OWNER') return <Alert>{t('ownerOnly')}</Alert>;
  return <>{children}</>;
}
