'use client';

import type { StaffProfile } from '@gearva/contracts';
import { Alert } from '@gearva/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/api';
import { AuthLayout } from './auth-layout';
import { STAFF_QUERY_KEY } from './use-staff';

class NoCode extends Error {}

/**
 * flow.md 11.3: the admin app's "View as garage" link lands here with a one-time code
 * after `#` (never sent to a server log). It is traded for a read-only session.
 */
export function ViewAsEntry() {
  const t = useTranslations('viewAs');
  const router = useRouter();
  const queryClient = useQueryClient();
  const open = useMutation({
    mutationFn: (code: string) => {
      if (!code) throw new NoCode();
      return apiPost<StaffProfile>('/v1/auth/view-as', { code });
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(STAFF_QUERY_KEY, profile);
      router.replace('/');
    },
  });
  // The code works once: never send it twice, even when React runs effects twice.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = window.location.hash.slice(1);
    window.history.replaceState(null, '', window.location.pathname);
    open.mutate(code);
  }, [open]);

  return (
    <AuthLayout title={t('title')}>
      {open.error instanceof NoCode ? (
        <Alert>{t('noCode')}</Alert>
      ) : open.error ? (
        <ApiErrorAlert error={open.error} />
      ) : (
        <p className="text-sm text-muted">{t('opening')}</p>
      )}
    </AuthLayout>
  );
}
