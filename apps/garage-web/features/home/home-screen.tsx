'use client';

import { useTranslations } from 'next-intl';
import { useStaff } from '@/features/auth/use-staff';
import { SearchPanel } from '@/features/search/search-panel';
import { Link } from '@/i18n/navigation';

/** The signed-in start page: search first (flow.md 3.3, 4.1 step 1). */
export function HomeScreen() {
  const t = useTranslations('home');
  const { data: me } = useStaff();
  if (!me) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <SearchPanel />
      {me.role === 'OWNER' && (
        <p className="text-sm text-slate-600">
          {t('setupBody')}{' '}
          <Link href="/settings/branches" className="underline">
            {t('manageBranches')}
          </Link>
          {' · '}
          <Link href="/settings/staff" className="underline">
            {t('manageStaff')}
          </Link>
        </p>
      )}
    </div>
  );
}
