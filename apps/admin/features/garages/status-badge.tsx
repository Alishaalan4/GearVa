'use client';

import type { GarageStatus } from '@gearva/contracts';
import { useTranslations } from 'next-intl';

const STYLES: Record<GarageStatus, string> = {
  TRIAL: 'bg-soft text-soft-ink',
  ACTIVE: 'bg-ok text-ok-ink',
  EXPIRED: 'bg-tint text-brand-ink',
  SUSPENDED: 'bg-bad text-bad-ink',
};

export function StatusBadge({ status }: { status: GarageStatus }) {
  const t = useTranslations('status');
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {t(status)}
    </span>
  );
}
