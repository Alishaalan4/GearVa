'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type AdminLoginInput, type AdminLoginResponse, adminLoginSchema } from '@gearva/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ApiErrorAlert } from '@/components/api-error';
import { Button, Field, Input } from '@/components/ui';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/api';
import { AuthLayout } from './auth-layout';
import { ADMIN_QUERY_KEY } from './use-admin';

/** flow.md 2.3: email + password; a code step follows only if the admin turned 2FA on. */
export function LoginForm() {
  const t = useTranslations('login');
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<z.input<typeof adminLoginSchema>, unknown, AdminLoginInput>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { email: '', password: '' },
  });
  const login = useMutation({
    mutationFn: (values: AdminLoginInput) =>
      apiPost<AdminLoginResponse>('/admin/v1/auth/login', values),
    onSuccess: (result) => {
      if (result.next === 'TOTP_VERIFY') {
        router.push('/login/verify');
        return;
      }
      queryClient.setQueryData(ADMIN_QUERY_KEY, result.admin);
      router.replace('/garages');
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
        <ApiErrorAlert error={login.error} />
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {t('submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
