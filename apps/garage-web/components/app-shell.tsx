'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect } from 'react';
import { useStaff } from '@/features/auth/use-staff';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError, apiPost, lockReasonOf } from '@/lib/api';
import { ApiErrorAlert } from './api-error';
import { LanguageToggle } from './language-toggle';

/** Everything behind sign-in: checks the session, then shows the header and the page. */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
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
    return <p className="p-8 text-sm text-slate-500">{t('common.loading')}</p>;
  }
  if (staff.error) {
    return (
      <div className="p-8">
        <ApiErrorAlert error={staff.error} />
      </div>
    );
  }

  const me = staff.data;
  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" className="font-semibold">
            {me.garage.name}
          </Link>
          {me.role === 'OWNER' && (
            <nav className="flex gap-4 text-sm">
              <Link href="/settings/branches" className="text-slate-700 hover:text-slate-900">
                {t('nav.branches')}
              </Link>
              <Link href="/settings/staff" className="text-slate-700 hover:text-slate-900">
                {t('nav.staff')}
              </Link>
            </nav>
          )}
          <div className="ms-auto flex items-center gap-4 text-sm">
            <span className="text-slate-500">{me.name}</span>
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
