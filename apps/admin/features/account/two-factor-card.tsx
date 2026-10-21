'use client';

import type {
  AdminProfile,
  AdminTotpEnableResponse,
  AdminTotpSetupResponse,
  AdminTotpVerifyInput,
} from '@gearva/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { Alert, Button, Card } from '@/components/ui';
import { RecoveryCodes } from '@/features/auth/recovery-codes';
import { SecondFactorForm } from '@/features/auth/second-factor-form';
import { ADMIN_QUERY_KEY } from '@/features/auth/use-admin';
import { apiPost } from '@/lib/api';

/**
 * Optional two-factor authentication (flow.md 2.3). Off: a button starts the setup, the
 * QR code is scanned, one code turns it on and the recovery codes are shown once.
 * On: a current code or a recovery code turns it off.
 */
export function TwoFactorCard({ admin }: { admin: AdminProfile }) {
  const t = useTranslations('account');
  const queryClient = useQueryClient();
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const setup = useMutation({
    mutationFn: () => apiPost<AdminTotpSetupResponse>('/admin/v1/auth/totp/setup'),
    onMutate: () => setNotice(null),
  });
  const enable = useMutation({
    mutationFn: (values: AdminTotpVerifyInput) =>
      apiPost<AdminTotpEnableResponse>('/admin/v1/auth/totp/enable', { code: values.code }),
    onSuccess: ({ recoveryCodes: codes }) => setRecoveryCodes(codes),
  });
  const disable = useMutation({
    mutationFn: (values: AdminTotpVerifyInput) =>
      apiPost<AdminProfile>('/admin/v1/auth/totp/disable', values),
    onSuccess: (profile) => {
      queryClient.setQueryData(ADMIN_QUERY_KEY, profile);
      setup.reset();
      setNotice(t('turnedOff'));
    },
  });

  if (recoveryCodes) {
    return (
      <Card title={t('recoveryTitle')}>
        <RecoveryCodes
          codes={recoveryCodes}
          onDone={() => {
            setRecoveryCodes(null);
            setup.reset();
            setNotice(t('turnedOn'));
            void queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEY });
          }}
        />
      </Card>
    );
  }

  return (
    <Card title={t('twoFactorTitle')}>
      <div className="space-y-4">
        {notice && <Alert tone="success">{notice}</Alert>}
        <p className="text-sm">
          <span className="text-slate-500">{t('status')} </span>
          <span className="font-medium">{admin.totpEnabled ? t('on') : t('off')}</span>
        </p>

        {admin.totpEnabled ? (
          <>
            <p className="text-sm text-slate-600">{t('turnOffHint')}</p>
            <SecondFactorForm
              codeLabel={t('codeLabel')}
              submitLabel={t('turnOff')}
              allowRecovery
              pending={disable.isPending}
              error={disable.error}
              onSubmit={(values) => disable.mutate(values)}
            />
          </>
        ) : !setup.data ? (
          <>
            <p className="text-sm text-slate-600">{t('offHint')}</p>
            <ApiErrorAlert error={setup.error} />
            <Button type="button" disabled={setup.isPending} onClick={() => setup.mutate()}>
              {t('turnOn')}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">{t('scan')}</p>
            <div className="flex justify-center rounded-md bg-white p-2 sm:justify-start">
              <QRCodeSVG value={setup.data.otpauthUri} size={192} marginSize={2} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-slate-500">{t('manual')}</p>
              <p className="break-all rounded bg-slate-50 p-2 font-mono text-sm" dir="ltr">
                {setup.data.secret}
              </p>
            </div>
            <SecondFactorForm
              codeLabel={t('codeLabel')}
              submitLabel={t('confirm')}
              allowRecovery={false}
              pending={enable.isPending}
              error={enable.error}
              onSubmit={(values) => enable.mutate(values)}
            />
          </>
        )}
      </div>
    </Card>
  );
}
