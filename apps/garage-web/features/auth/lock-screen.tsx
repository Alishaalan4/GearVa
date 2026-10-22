'use client';

import type { GarageLockReason } from '@gearva/contracts';
import { Button } from '@gearva/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/api';
import { AuthLayout } from './auth-layout';

/**
 * flow.md 2.2 step 3 and 2.5: the garage is suspended, expired or its trial ended.
 * Nothing is deleted and the session is kept, so "Try again" works as soon as Gearva
 * unlocks the garage.
 */
export function LockScreen({ reason, onClose }: { reason: GarageLockReason; onClose: () => void }) {
  const t = useTranslations('lock');
  const router = useRouter();
  const queryClient = useQueryClient();

  const signOut = useMutation({
    mutationFn: () => apiPost<void>('/v1/auth/logout'),
    onSettled: () => {
      queryClient.clear();
      onClose();
      router.replace('/login');
    },
  });

  return (
    <AuthLayout title={t(`title.${reason}`)}>
      <div className="space-y-4">
        <p className="text-sm text-slate-700">{t(`body.${reason}`)}</p>
        <p className="text-sm text-slate-500">{t('dataSafe')}</p>
        <Button
          type="button"
          className="w-full"
          onClick={() => {
            onClose();
            // Asks the API again; if the garage is still locked, this screen comes back.
            void queryClient.resetQueries();
          }}
        >
          {t('retry')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
        >
          {t('signOut')}
        </Button>
      </div>
    </AuthLayout>
  );
}
