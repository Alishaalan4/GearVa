'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PageTabs } from '@/components/page-tabs';
import { useStaff } from '@/features/auth/use-staff';
import { usePathname, useRouter } from '@/i18n/navigation';
import { InvoiceList } from './invoice-list';
import { InvoiceSettingsPage } from './invoice-settings';

const TABS = ['list', 'settings'] as const;
type Tab = (typeof TABS)[number];

/**
 * Step 7.2: the Invoices page holds the list and, for the owner, the invoice settings
 * (they were a separate page under Settings). `?tab=settings` opens the settings; the old
 * address /settings/invoices sends here.
 */
export function InvoicesPage({
  initialFilter,
  initialTab,
}: {
  initialFilter?: string;
  initialTab?: string;
}) {
  const t = useTranslations('invoiceList');
  const staff = useStaff();
  const router = useRouter();
  const pathname = usePathname();
  const isOwner = staff.data?.role === 'OWNER';
  const [tab, setTab] = useState<Tab>(initialTab === 'settings' ? 'settings' : 'list');
  const shown: Tab = tab === 'settings' && isOwner ? 'settings' : 'list';

  const open = (next: Tab) => {
    setTab(next);
    router.replace(next === 'settings' ? `${pathname}?tab=settings` : pathname);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      {isOwner && (
        <PageTabs tabs={TABS} current={shown} label={(n) => t(`tabs.${n}`)} onChange={open} />
      )}
      {shown === 'list' ? <InvoiceList initialFilter={initialFilter} /> : <InvoiceSettingsPage />}
    </div>
  );
}
