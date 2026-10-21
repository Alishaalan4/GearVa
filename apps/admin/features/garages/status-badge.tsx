'use client';

import type { GarageStatus } from '@gearva/contracts';
import { useTranslations } from 'next-intl';

const STYLES: Record<GarageStatus, string> = {
  TRIAL: 'bg-sky-100 text-sky-800',
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  EXPIRED: 'bg-amber-100 text-amber-800',
  SUSPENDED: 'bg-red-100 text-red-800',
};

export function StatusBadge({ status }: { status: GarageStatus }) {
  const t = useTranslations('status');
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {t(status)}
    </span>
  );
}
