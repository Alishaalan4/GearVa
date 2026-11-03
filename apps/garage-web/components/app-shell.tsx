'use client';

import { AppFrame, Logo, navItemClass } from '@gearva/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect } from 'react';
import { useStaff } from '@/features/auth/use-staff';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { ApiError, apiPost, lockReasonOf } from '@/lib/api';
import { ApiErrorAlert } from './api-error';
import { LanguageToggle } from './language-toggle';

/** Everything behind sign-in: checks the session, then shows the header and the page. */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const staff = useStaff();

  const notSignedIn = staff.error instanceof ApiError && staff.error.status === 401;
  useEffect(() => {
    if (notSignedIn) router.replace('/login');
  }, [notSignedIn, router]);

  const signOut = useMutation({
    mutationFn: () => apiPost<void>('/v1/auth/logout'),
    onSettled: () => {
      queryClient.clear();
      router.replace('/login');
    },
  });

  // A locked garage is shown by Providers' lock screen; keep this empty meanwhile.
  if (staff.isPending || notSignedIn || lockReasonOf(staff.error)) {
    return <p className="p-8 text-sm text-muted">{t('common.loading')}</p>;
  }
  if (staff.error) {
    return (
      <div className="p-8">
        <ApiErrorAlert error={staff.error} />
      </div>
    );
  }

  const me = staff.data;
  const item = (href: string, label: string, active = pathname.startsWith(href)) => (
    <Link href={href} className={navItemClass(active)}>
      {label}
    </Link>
  );
  return (
    <AppFrame
      brand={
        <Link href="/">
          <Logo />
        </Link>
      }
      subtitle={me.garage.name}
      nav={
        <>
          {item('/', t('nav.home'), pathname === '/')}
          {item('/customers', t('nav.customers'))}
          {/* flow.md 1: money screens by role; mechanics see an invoice from its visit. */}
          {me.role !== 'MECHANIC' && (
            <>
              {item('/invoices', t('nav.invoices'))}
              {item('/debts', t('nav.debts'))}
            </>
          )}
          {(me.role === 'OWNER' || me.role === 'MANAGER') && item('/income', t('nav.income'))}
          {me.role === 'OWNER' && (
            <>
              {item('/settings/branches', t('nav.branches'))}
              {item('/settings/staff', t('nav.staff'))}
              {item('/settings/invoices', t('nav.invoiceSettings'))}
            </>
          )}
        </>
      }
      footer={
        <>
          <span className="px-3.5 py-2 text-xs text-sidebar-ink">{me.name}</span>
          <LanguageToggle className={navItemClass()} />
          <button
            type="button"
            className={navItemClass()}
            disabled={signOut.isPending}
            onClick={() => signOut.mutate()}
          >
            {t('nav.signOut')}
          </button>
        </>
      }
    >
      {children}
    </AppFrame>
  );
}
