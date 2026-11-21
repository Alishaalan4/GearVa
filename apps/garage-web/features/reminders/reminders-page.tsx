'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PageTabs } from '@/components/page-tabs';
import { useStaff } from '@/features/auth/use-staff';
import { NotificationLog } from '@/features/notifications/notification-log';
import { usePathname, useRouter } from '@/i18n/navigation';
import { RemindersDue } from './reminders-due';

const TABS = ['due', 'log'] as const;
type Tab = (typeof TABS)[number];

/**
 * Step 7.3: one Reminders page. "To send" is the WhatsApp list (flow.md 9.5; owner,
 * managers, receptionists); "Message log" is what was sent and how it went (flow.md 9.4;
 * owner and managers only, so receptionists see no tabs). `?tab=log` opens the log; the
 * old address /notifications sends here.
 */
export function RemindersPage({ initialTab }: { initialTab?: string }) {
  const t = useTranslations('reminders');
  const staff = useStaff();
  const router = useRouter();
  const pathname = usePathname();
  const role = staff.data?.role;
  const seesLog = role === 'OWNER' || role === 'MANAGER';
  const [tab, setTab] = useState<Tab>(initialTab === 'log' ? 'log' : 'due');
  const shown: Tab = tab === 'log' && seesLog ? 'log' : 'due';

  const open = (next: Tab) => {
    setTab(next);
    router.replace(next === 'log' ? `${pathname}?tab=log` : pathname);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">{t('pageTitle')}</h1>
      {seesLog && (
        <PageTabs tabs={TABS} current={shown} label={(n) => t(`tabs.${n}`)} onChange={open} />
      )}
      {shown === 'due' ? <RemindersDue /> : <NotificationLog />}
    </div>
  );
}
