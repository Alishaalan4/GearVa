'use client';

import type { GarageStatus } from '@gearva/contracts';
import { Pill } from '@gearva/ui';
import { useTranslations } from 'next-intl';

const TONES = {
  TRIAL: 'soft',
  ACTIVE: 'ok',
  EXPIRED: 'brand',
  SUSPENDED: 'bad',
} as const satisfies Record<GarageStatus, string>;

export function StatusBadge({ status }: { status: GarageStatus }) {
  const t = useTranslations('status');
  return <Pill tone={TONES[status]}>{t(status)}</Pill>;
}
