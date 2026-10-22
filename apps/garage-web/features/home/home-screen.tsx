'use client';

import { Card } from '@gearva/ui';
import { useTranslations } from 'next-intl';
import { useStaff } from '@/features/auth/use-staff';
import { Link } from '@/i18n/navigation';

/** The signed-in start page. Quick entry and search take this place in Phase 2. */
export function HomeScreen() {
  const t = useTranslations('home');
  const tRoles = useTranslations('roles');
  const { data: me } = useStaff();
  if (!me) return null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('welcome', { name: me.name })}</h1>
        <p className="text-sm text-slate-600">
          {t('signedInAs', { role: tRoles(me.role), garage: me.garage.name })}
        </p>
      </div>
      {me.role === 'OWNER' && (
        <Card title={t('setupTitle')}>
          <p className="mb-4 text-sm text-slate-600">{t('setupBody')}</p>
          <div className="flex flex-wrap gap-3 text-sm font-medium">
            <Link href="/settings/branches" className="underline">
              {t('manageBranches')}
            </Link>
            <Link href="/settings/staff" className="underline">
              {t('manageStaff')}
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
