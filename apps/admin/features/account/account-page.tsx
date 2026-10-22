'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@gearva/ui';
import { useAdmin } from '@/features/auth/use-admin';
import { TwoFactorCard } from './two-factor-card';

/** The signed-in admin's own account. */
export function AccountPage() {
  const t = useTranslations('account');
  const admin = useAdmin();
  // PanelShell only renders pages once the admin is loaded.
  if (!admin.data) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <Card title={t('profile')}>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">{t('name')}</dt>
            <dd className="font-medium">{admin.data.name}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">{t('email')}</dt>
            <dd className="font-medium" dir="ltr">
              {admin.data.email}
            </dd>
          </div>
        </dl>
      </Card>
      <TwoFactorCard admin={admin.data} />
    </div>
  );
}
