'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PASSWORD_MIN_LENGTH, type StaffProfile, setPasswordSchema } from '@gearva/contracts';
import { Alert, Button, Field, Input } from '@gearva/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiErrorAlert } from '@/components/api-error';
import { useRouter } from '@/i18n/navigation';
import { apiPost, lockReasonOf } from '@/lib/api';
import { AuthLayout } from './auth-layout';
import { STAFF_QUERY_KEY } from './use-staff';

// The API's password rule, plus a second entry that must match (checked only here).
const formSchema = setPasswordSchema
  .pick({ password: true })
  .extend({ confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'] });
type FormValues = z.infer<typeof formSchema>;

/**
 * flow.md 2.1 step 4 and 2.2: the invite and the password-reset email both link here
 * with ?token=. Setting the password signs the person in.
 */
export function SetPasswordForm({ token }: { token: string | undefined }) {
  const t = useTranslations('setPassword');
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: '', confirm: '' },
  });
  const save = useMutation({
    mutationFn: ({ password }: FormValues) =>
      apiPost<StaffProfile>('/v1/auth/set-password', { token, password }),
    onSuccess: (profile) => {
      queryClient.setQueryData(STAFF_QUERY_KEY, profile);
      router.replace('/');
    },
  });
  const { errors } = form.formState;

  if (!token) {
    return (
      <AuthLayout title={t('title')}>
        <Alert>{t('noToken')}</Alert>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('title')}>
      <p className="-mt-3 mb-5 text-sm text-slate-500">{t('intro')}</p>
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
        {!lockReasonOf(save.error) && <ApiErrorAlert error={save.error} />}
        <Button type="submit" className="w-full" disabled={save.isPending}>
          {t('submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
