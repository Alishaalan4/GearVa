'use client';

import { AppFrame, Logo, navItemClass } from '@gearva/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect } from 'react';
import { useAdmin } from '@/features/auth/use-admin';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { ApiError, apiPost } from '@/lib/api';
import { ApiErrorAlert } from './api-error';
import { LanguageToggle } from './language-toggle';

/** Everything behind sign-in: checks the session, then shows the header and the page. */
export function PanelShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const admin = useAdmin();

  const notSignedIn = admin.error instanceof ApiError && admin.error.status === 401;
  useEffect(() => {
    if (notSignedIn) router.replace('/login');
  }, [notSignedIn, router]);

  const signOut = useMutation({
    mutationFn: () => apiPost<void>('/admin/v1/auth/logout'),
    onSettled: () => {
      queryClient.clear();
      router.replace('/login');
    },
  });

  if (admin.isPending || notSignedIn) {
    return <p className="p-8 text-sm text-muted">{t('common.loading')}</p>;
  }
  if (admin.error) {
    return (
      <div className="p-8">
        <ApiErrorAlert error={admin.error} />
      </div>
    );
  }

  const item = (href: string, label: string) => (
    <Link href={href} className={navItemClass(pathname.startsWith(href))}>
      {label}
    </Link>
  );
  return (
    <AppFrame
      brand={
        <Link href="/garages">
          <Logo />
        </Link>
      }
      subtitle={t('nav.brand')}
      nav={
        <>
          {item('/garages', t('nav.garages'))}
          {item('/account', t('nav.account'))}
        </>
      }
      footer={
        <>
          <span className="px-3.5 py-2 text-xs text-sidebar-ink">{admin.data.name}</span>
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
