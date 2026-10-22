'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type AdminTotpVerifyInput, adminTotpVerifySchema } from '@gearva/contracts';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ApiErrorAlert } from '@/components/api-error';
import { Button, Field, Input } from '@gearva/ui';

/**
 * The 6-digit code (or, once 2FA is on, a recovery code), validated with the same
 * schema as the API. Hidden fields are unregistered, so only one of the two is sent.
 */
export function SecondFactorForm({
  codeLabel,
  submitLabel,
  allowRecovery,
  pending,
  error,
  onSubmit,
}: {
  codeLabel: string;
  submitLabel: string;
  allowRecovery: boolean;
  pending: boolean;
  error: unknown;
  onSubmit: (values: AdminTotpVerifyInput) => void;
}) {
  const t = useTranslations('verify');
  const [useRecovery, setUseRecovery] = useState(false);
  const form = useForm<z.input<typeof adminTotpVerifySchema>, unknown, AdminTotpVerifyInput>({
    resolver: zodResolver(adminTotpVerifySchema),
    shouldUnregister: true,
  });
  const invalid = Object.keys(form.formState.errors).length > 0;

  return (
    <form className="space-y-4" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      {useRecovery ? (
        <Field label={t('recoveryLabel')} error={invalid ? t('recoveryInvalid') : undefined}>
          <Input
            autoComplete="one-time-code"
            dir="ltr"
            className="font-mono"
            aria-invalid={invalid}
            {...form.register('recoveryCode')}
          />
        </Field>
      ) : (
        <Field label={codeLabel} error={invalid ? t('codeInvalid') : undefined}>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            dir="ltr"
            className="font-mono text-lg tracking-widest"
            aria-invalid={invalid}
            {...form.register('code')}
          />
        </Field>
      )}
      <ApiErrorAlert error={error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {submitLabel}
      </Button>
      {allowRecovery && (
        <button
          type="button"
          className="w-full text-center text-sm text-slate-600 hover:text-slate-900"
          onClick={() => {
            form.clearErrors();
            setUseRecovery((v) => !v);
          }}
        >
          {useRecovery ? t('useCode') : t('useRecovery')}
        </button>
      )}
    </form>
  );
}
