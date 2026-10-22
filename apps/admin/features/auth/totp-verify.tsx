'use client';

import type { AdminProfile, AdminTotpVerifyInput } from '@gearva/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Alert } from '@gearva/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError, apiPost } from '@/lib/api';
import { AuthLayout } from './auth-layout';
import { SecondFactorForm } from './second-factor-form';
import { ADMIN_QUERY_KEY } from './use-admin';

/** flow.md 2.3, second step for admins who turned 2FA on: the app code or a recovery code. */
export function TotpVerify() {
  const t = useTranslations('verify');
  const router = useRouter();
  const queryClient = useQueryClient();

  const verify = useMutation({
    mutationFn: (values: AdminTotpVerifyInput) =>
      apiPost<AdminProfile>('/admin/v1/auth/totp/verify', values),
    onSuccess: (profile) => {
      queryClient.setQueryData(ADMIN_QUERY_KEY, profile);
      router.replace('/garages');
    },
  });

  const expired = verify.error instanceof ApiError && verify.error.code === 'UNAUTHORIZED';

  return (
    <AuthLayout title={t('title')}>
      {expired ? (
        <div className="space-y-4">
          <Alert>{t('expired')}</Alert>
          <Link href="/login" className="block text-center text-sm font-medium underline">
            {t('restart')}
          </Link>
        </div>
      ) : (
        <SecondFactorForm
          codeLabel={t('codeLabel')}
          submitLabel={t('submit')}
          allowRecovery
          pending={verify.isPending}
          error={verify.error}
          onSubmit={(values) => verify.mutate(values)}
        />
      )}
    </AuthLayout>
  );
}
