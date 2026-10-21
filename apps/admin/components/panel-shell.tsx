'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect } from 'react';
import { useAdmin } from '@/features/auth/use-admin';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError, apiPost } from '@/lib/api';
import { ApiErrorAlert } from './api-error';
import { LanguageToggle } from './language-toggle';

/** Everything behind sign-in: checks the session, then shows the header and the page. */
export function PanelShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
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
    return <p className="p-8 text-sm text-slate-500">{t('common.loading')}</p>;
  }
  if (admin.error) {
    return (
      <div className="p-8">
        <ApiErrorAlert error={admin.error} />
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/garages" className="font-semibold">
            {t('nav.brand')}
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/garages" className="text-slate-700 hover:text-slate-900">
              {t('nav.garages')}
            </Link>
            <Link href="/account" className="text-slate-700 hover:text-slate-900">
              {t('nav.account')}
            </Link>
          </nav>
          <div className="ms-auto flex items-center gap-4 text-sm">
            <span className="text-slate-500">{admin.data.name}</span>
            <LanguageToggle />
            <button
              type="button"
              className="text-slate-700 hover:text-slate-900"
              disabled={signOut.isPending}
              onClick={() => signOut.mutate()}
            >
              {t('nav.signOut')}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
