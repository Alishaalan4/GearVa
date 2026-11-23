'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ownerLoginSchema } from '@gearva/contracts';
import { Alert, Button, Card, Field, Input } from '@gearva/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiErrorAlert } from '@/components/api-error';
import { Link } from '@/i18n/navigation';
import { apiPost } from '@/lib/api';
import { PublicShell } from './public-shell';

// The login's email and password, plus a box the person must tick (checked only here).
const formSchema = ownerLoginSchema.extend({ sure: z.boolean().refine((v) => v) });
type FormValues = z.infer<typeof formSchema>;

/**
 * Step 7.7, mobile-api.md 2.6: an owner app account can be deleted here without the app
 * (Google Play requires a web path). Same result as "Delete account" in the app (3.5).
 */
export function DeleteAccountForm() {
  const t = useTranslations('deleteAccount');
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '', sure: false },
  });
  const remove = useMutation({
    mutationFn: ({ email, password }: FormValues) =>
      apiPost<void>('/mobile/v1/auth/delete-account', { email, password }),
  });
  const { errors } = form.formState;

  return (
    <PublicShell>
      <h1 className="text-3xl font-extrabold">{t('title')}</h1>
      <p className="mt-4 leading-relaxed">{t('intro')}</p>
      <ul className="mt-4 list-disc space-y-1 ps-6 text-sm leading-relaxed text-soft-ink">
        <li>{t('removed')}</li>
        <li>{t('kept')}</li>
        <li>{t('inApp')}</li>
      </ul>

      <Card className="mt-8 max-w-md">
        {remove.isSuccess ? (
          <Alert tone="success">{t('done')}</Alert>
        ) : (
          <form
            className="space-y-4"
            noValidate
            onSubmit={form.handleSubmit((values) => remove.mutate(values))}
          >
            <Field label={t('email')} error={errors.email && t('emailInvalid')}>
              <Input
                type="email"
                autoComplete="email"
                dir="ltr"
                aria-invalid={!!errors.email}
                {...form.register('email')}
              />
            </Field>
            <Field label={t('password')} error={errors.password && t('passwordInvalid')}>
              <Input
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                {...form.register('password')}
              />
            </Field>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 size-4" {...form.register('sure')} />
              <span>{t('sure')}</span>
            </label>
            {errors.sure && <p className="text-xs text-bad-ink">{t('sureMissing')}</p>}
            <ApiErrorAlert error={remove.error} />
            <Button type="submit" variant="danger" className="w-full" disabled={remove.isPending}>
              {t('submit')}
            </Button>
            <p className="text-xs text-muted">
              {t('forgot')}{' '}
              <Link href="/support" className="underline">
                {t('supportLink')}
              </Link>
            </p>
          </form>
        )}
      </Card>
    </PublicShell>
  );
}
