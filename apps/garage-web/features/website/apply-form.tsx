'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ApplyInput, applySchema } from '@gearva/contracts';
import { Alert, Button, Field, Input, Textarea } from '@gearva/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ApiErrorAlert } from '@/components/api-error';
import { apiPost } from '@/lib/api';

type ApplyValues = z.output<typeof applySchema>;

const EMPTY: ApplyInput = {
  garageName: '',
  ownerName: '',
  email: '',
  phone: '',
  city: '',
  branchCount: 1,
  message: '',
  website: '',
};

/**
 * flow.md 11.6 item 1: the Apply form. No account is created; the visitor only learns
 * "we will contact you". `website` is the honeypot, hidden from people.
 */
export function ApplyForm() {
  const t = useTranslations('website.apply');
  const form = useForm<ApplyInput, unknown, ApplyValues>({
    resolver: zodResolver(applySchema),
    defaultValues: EMPTY,
  });
  const send = useMutation({
    mutationFn: (values: ApplyValues) => apiPost<void>('/v1/public/applications', values),
    onSuccess: () => form.reset(EMPTY),
  });
  const { errors } = form.formState;

  if (send.isSuccess) {
    return (
      <div className="space-y-3">
        <Alert tone="success">{t('sentTitle')}</Alert>
        <p className="text-sm text-muted">{t('sentText')}</p>
        <Button type="button" variant="secondary" onClick={() => send.reset()}>
          {t('again')}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={form.handleSubmit((values) => send.mutate(values))}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('garageName')} error={errors.garageName && t('garageNameError')}>
          <Input aria-invalid={!!errors.garageName} {...form.register('garageName')} />
        </Field>
        <Field label={t('ownerName')} error={errors.ownerName && t('ownerNameError')}>
          <Input
            autoComplete="name"
            aria-invalid={!!errors.ownerName}
            {...form.register('ownerName')}
          />
        </Field>
        <Field label={t('email')} error={errors.email && t('emailError')}>
          <Input
            type="email"
            autoComplete="email"
            dir="ltr"
            aria-invalid={!!errors.email}
            {...form.register('email')}
          />
        </Field>
        <Field label={t('phone')} error={errors.phone && t('phoneError')}>
          <Input
            type="tel"
            autoComplete="tel"
            dir="ltr"
            placeholder="+961 3 123 456"
            aria-invalid={!!errors.phone}
            {...form.register('phone')}
          />
        </Field>
        <Field label={t('city')} error={errors.city && t('cityError')}>
          <Input aria-invalid={!!errors.city} {...form.register('city')} />
        </Field>
        <Field label={t('branches')} error={errors.branchCount && t('branchesError')}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            aria-invalid={!!errors.branchCount}
            {...form.register('branchCount', { valueAsNumber: true })}
          />
        </Field>
      </div>
      <Field label={t('message')} error={errors.message && t('messageError')}>
        <Textarea rows={3} aria-invalid={!!errors.message} {...form.register('message')} />
      </Field>
      {/* The honeypot: off screen and skipped by the keyboard, so only bots fill it in. */}
      <div className="absolute -start-[9999px] size-px overflow-hidden" aria-hidden="true">
        <label>
          Website
          <input type="text" tabIndex={-1} autoComplete="off" {...form.register('website')} />
        </label>
      </div>
      <ApiErrorAlert error={send.error} />
      <Button type="submit" disabled={send.isPending}>
        {t('submit')}
      </Button>
    </form>
  );
}
