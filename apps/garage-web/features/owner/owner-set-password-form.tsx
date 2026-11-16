'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type OwnerSetPasswordResponse,
  PASSWORD_MIN_LENGTH,
  ownerSetPasswordSchema,
} from '@gearva/contracts';
import { Alert, AuthFrame, Button, Field, Input } from '@gearva/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiErrorAlert } from '@/components/api-error';
import { LanguageToggle } from '@/components/language-toggle';
import { Link } from '@/i18n/navigation';
import { apiPost } from '@/lib/api';

// The API's password rule, plus a second entry that must match (checked only here).
const formSchema = ownerSetPasswordSchema
  .pick({ password: true })
  .extend({ confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'] });
type FormValues = z.infer<typeof formSchema>;

function OwnerFrame({ title, children }: { title: string; children: ReactNode }) {
  const t = useTranslations('ownerSetPassword');
  return (
    <AuthFrame
      heading={t('side.heading')}
      points={[t('side.point1'), t('side.point2'), t('side.point3')]}
      language={<LanguageToggle />}
      title={title}
    >
      {children}
    </AuthFrame>
  );
}

/**
 * flow.md 2.4 step 2: a car owner's invite (or reset) email links here with ?token=.
 * The password is for the Gearva owner app; this page signs nobody in.
 */
export function OwnerSetPasswordForm({ token }: { token: string | undefined }) {
  const t = useTranslations('ownerSetPassword');
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: '', confirm: '' },
  });
  const save = useMutation({
    mutationFn: ({ password }: FormValues) =>
      apiPost<OwnerSetPasswordResponse>('/mobile/v1/auth/set-password', { token, password }),
  });
  const { errors } = form.formState;

  if (!token) {
    return (
      <OwnerFrame title={t('title')}>
        <Alert>{t('noToken')}</Alert>
      </OwnerFrame>
    );
  }

  if (save.data) {
    return (
      <OwnerFrame title={t('doneTitle')}>
        <Alert tone="success">{t('done')}</Alert>
        <p className="mt-4 text-sm leading-relaxed">
          {t('doneSignIn')}{' '}
          <b dir="ltr" className="break-all">
            {save.data.email}
          </b>
        </p>
        <p className="mt-6 text-xs text-muted">
          <Link href="/privacy" className="underline">
            {t('privacy')}
          </Link>
        </p>
      </OwnerFrame>
    );
  }

  return (
    <OwnerFrame title={t('title')}>
      <p className="-mt-3 mb-5 text-sm text-muted">{t('intro')}</p>
      <form
        className="space-y-4"
        noValidate
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
      >
        <Field
          label={t('password')}
          hint={t('passwordHint', { min: PASSWORD_MIN_LENGTH })}
          error={errors.password && t('passwordInvalid', { min: PASSWORD_MIN_LENGTH })}
        >
          <Input
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...form.register('password')}
          />
        </Field>
        <Field label={t('confirm')} error={errors.confirm && t('confirmMismatch')}>
          <Input
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.confirm}
            {...form.register('confirm')}
          />
        </Field>
        <ApiErrorAlert error={save.error} />
        <Button type="submit" className="w-full" disabled={save.isPending}>
          {t('submit')}
        </Button>
      </form>
      <p className="mt-6 text-xs text-muted">
        <Link href="/privacy" className="underline">
          {t('privacy')}
        </Link>
      </p>
    </OwnerFrame>
  );
}
