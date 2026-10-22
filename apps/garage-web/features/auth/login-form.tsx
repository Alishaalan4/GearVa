'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type StaffLoginInput, type StaffProfile, staffLoginSchema } from '@gearva/contracts';
import { Button, Field, Input } from '@gearva/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ApiErrorAlert } from '@/components/api-error';
import { useRouter } from '@/i18n/navigation';
import { apiPost, lockReasonOf } from '@/lib/api';
import { AuthLayout } from './auth-layout';
import { STAFF_QUERY_KEY } from './use-staff';

/** flow.md 2.2: email + password. A locked garage gets the lock screen (Providers). */
export function LoginForm() {
  const t = useTranslations('login');
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<z.input<typeof staffLoginSchema>, unknown, StaffLoginInput>({
    resolver: zodResolver(staffLoginSchema),
    defaultValues: { email: '', password: '' },
  });
  const login = useMutation({
    mutationFn: (values: StaffLoginInput) => apiPost<StaffProfile>('/v1/auth/login', values),
    onSuccess: (profile) => {
      queryClient.setQueryData(STAFF_QUERY_KEY, profile);
      router.replace('/');
    },
  });
  const { errors } = form.formState;

  return (
    <AuthLayout title={t('title')}>
      <p className="-mt-3 mb-5 text-sm text-slate-500">{t('subtitle')}</p>
      <form
        className="space-y-4"
        noValidate
        onSubmit={form.handleSubmit((values) => login.mutate(values))}
      >
        <Field label={t('email')} error={errors.email && t('emailInvalid')}>
          <Input
            type="email"
            autoComplete="username"
            dir="ltr"
            aria-invalid={!!errors.email}
            {...form.register('email')}
          />
        </Field>
        <Field label={t('password')} error={errors.password && t('passwordRequired')}>
          <Input
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...form.register('password')}
          />
        </Field>
        {!lockReasonOf(login.error) && <ApiErrorAlert error={login.error} />}
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {t('submit')}
        </Button>
        <p className="text-center text-xs text-slate-500">{t('forgot')}</p>
      </form>
    </AuthLayout>
  );
}
