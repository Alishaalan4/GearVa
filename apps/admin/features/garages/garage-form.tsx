'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateGarageInput,
  type GarageDetail,
  LOCALES,
  createGarageSchema,
} from '@gearva/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { ApiErrorAlert } from '@/components/api-error';
import { Button, Card, Field, Input, Select } from '@gearva/ui';
import { useRouter } from '@/i18n/navigation';
import { ApiError, apiPost } from '@/lib/api';
import { useSystemSettings } from '../settings/use-system-settings';

type FormInput = z.input<typeof createGarageSchema>;
type FieldName =
  | 'name'
  | 'email'
  | 'phone'
  | 'locationText'
  | 'timezone'
  | 'defaultLocale'
  | 'ownerName'
  | 'paidUntil';

/**
 * flow.md 2.1 step 1: the "New garage" form, validated with the API's own schema.
 * Approving an application (flow.md 11.6) uses it too: filled in from the application,
 * and sent to the approve endpoint, which creates the garage and marks the application.
 */
export function GarageForm({
  initial,
  submitPath = '/admin/v1/garages',
  title,
  before,
  onCreated,
}: {
  initial?: Partial<FormInput>;
  submitPath?: string;
  title?: string;
  /** shown above the form (the application being approved) */
  before?: ReactNode;
  onCreated?: () => void;
} = {}) {
  const t = useTranslations('garageForm');
  const tLocales = useTranslations('locales');
  const router = useRouter();
  const queryClient = useQueryClient();
  const settings = useSystemSettings();

  const form = useForm<FormInput, unknown, CreateGarageInput>({
    resolver: zodResolver(createGarageSchema),
    shouldUnregister: true,
    defaultValues: {
      plan: 'TRIAL',
      name: '',
      email: '',
      phone: '',
      locationText: '',
      timezone: 'Asia/Beirut',
      defaultLocale: 'ar',
      ownerName: '',
      ...initial,
    },
  });
  const plan = useWatch({ control: form.control, name: 'plan' });
  const errors = form.formState.errors as Partial<Record<FieldName, unknown>>;
  const errorFor = (name: FieldName) => (errors[name] ? t(`invalid.${name}`) : undefined);

  const create = useMutation({
    mutationFn: (values: CreateGarageInput) => apiPost<GarageDetail>(submitPath, values),
    onSuccess: (garage) => {
      void queryClient.invalidateQueries({ queryKey: ['garages'] });
      onCreated?.();
      queryClient.setQueryData(['garage', garage.id], garage);
      router.push(`/garages/${garage.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'EMAIL_ALREADY_USED') {
        form.setError('email', { type: 'server' });
      }
    },
  });

  return (
    <form
      className="mx-auto max-w-2xl space-y-6"
      noValidate
      onSubmit={form.handleSubmit((values) => create.mutate(values))}
    >
      <h1 className="text-2xl font-extrabold">{title ?? t('title')}</h1>
      {before}

      <Card title={t('sectionGarage')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('name')} error={errorFor('name')}>
            <Input aria-invalid={!!errors.name} {...form.register('name')} />
          </Field>
          <Field label={t('phone')} error={errorFor('phone')}>
            <Input type="tel" dir="ltr" aria-invalid={!!errors.phone} {...form.register('phone')} />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label={t('email')}
              hint={t('emailHint')}
              error={
                create.error instanceof ApiError && create.error.code === 'EMAIL_ALREADY_USED'
                  ? undefined
                  : errorFor('email')
              }
            >
              <Input
                type="email"
                dir="ltr"
                aria-invalid={!!errors.email}
                {...form.register('email')}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label={t('locationText')} error={errorFor('locationText')}>
              <Input aria-invalid={!!errors.locationText} {...form.register('locationText')} />
            </Field>
          </div>
          <Field label={t('defaultLocale')} error={errorFor('defaultLocale')}>
            <Select {...form.register('defaultLocale')}>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {tLocales(l)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('timezone')} error={errorFor('timezone')}>
            <Input dir="ltr" aria-invalid={!!errors.timezone} {...form.register('timezone')} />
          </Field>
        </div>
      </Card>

      <Card title={t('sectionOwner')}>
        <Field label={t('ownerName')} error={errorFor('ownerName')}>
          <Input aria-invalid={!!errors.ownerName} {...form.register('ownerName')} />
        </Field>
      </Card>

      <Card title={t('sectionPlan')}>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" value="TRIAL" {...form.register('plan')} />
              {settings.data
                ? t('planTrial', { days: settings.data.trialDays })
                : t('planTrialPlain')}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" value="PAID" {...form.register('plan')} />
              {t('planPaid')}
            </label>
          </div>
          {plan === 'PAID' && (
            <Field label={t('paidUntil')} error={errorFor('paidUntil')}>
              <Input
                type="date"
                className="w-auto"
                aria-invalid={!!errors.paidUntil}
                {...form.register('paidUntil')}
              />
            </Field>
          )}
        </div>
      </Card>

      <ApiErrorAlert error={create.error} />
      <Button type="submit" disabled={create.isPending}>
        {t('submit')}
      </Button>
    </form>
  );
}
