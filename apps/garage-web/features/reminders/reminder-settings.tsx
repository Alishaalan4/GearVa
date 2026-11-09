'use client';

import type { ReminderSettings, UpdateReminderSettingsInput } from '@gearva/contracts';
import { Alert, Button, Card, Field, Input } from '@gearva/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { api, apiPatch } from '@/lib/api';

const SETTINGS_KEY = ['reminder-settings'] as const;

/** A whole number from `min` to `max` typed in a field, or null. */
function whole(text: string, min: number, max: number): number | null {
  if (!/^\d{1,5}$/.test(text.trim())) return null;
  const value = Number(text);
  return value >= min && value <= max ? value : null;
}

/** flow.md 9.1, 9.2: how early reminders go out, and the monthly reminder. Owner only. */
export function ReminderSettingsPage() {
  const tCommon = useTranslations('common');
  const settings = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => api<ReminderSettings>('/v1/reminder-settings'),
  });
  if (settings.isPending) return <p className="text-sm text-muted">{tCommon('loading')}</p>;
  if (settings.error) return <ApiErrorAlert error={settings.error} />;
  return (
    <div className="mx-auto max-w-2xl">
      <SettingsForm settings={settings.data} />
    </div>
  );
}

function SettingsForm({ settings }: { settings: ReminderSettings }) {
  const t = useTranslations('reminderSettings');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const [leadKm, setLeadKm] = useState(String(settings.reminderLeadKm));
  const [leadDays, setLeadDays] = useState(String(settings.reminderLeadDays));
  const [monthly, setMonthly] = useState(settings.monthlyReminderEnabled);
  const save = useMutation({
    mutationFn: (body: UpdateReminderSettingsInput) =>
      apiPatch<ReminderSettings>('/v1/reminder-settings', body),
    onSuccess: (saved) => queryClient.setQueryData(SETTINGS_KEY, saved),
  });

  const km = whole(leadKm, 0, 5000);
  const days = whole(leadDays, 0, 60);

  return (
    <Card title={t('title')}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (km === null || days === null) return;
          save.mutate({
            reminderLeadKm: km,
            reminderLeadDays: days,
            monthlyReminderEnabled: monthly,
          });
        }}
      >
        <p className="text-sm text-muted">{t('intro')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('leadKm')}
            hint={t('leadKmHint')}
            error={km === null ? t('leadKmInvalid') : undefined}
          >
            <Input
              inputMode="numeric"
              dir="ltr"
              aria-invalid={km === null}
              value={leadKm}
              onChange={(e) => setLeadKm(e.target.value)}
            />
          </Field>
          <Field
            label={t('leadDays')}
            hint={t('leadDaysHint')}
            error={days === null ? t('leadDaysInvalid') : undefined}
          >
            <Input
              inputMode="numeric"
              dir="ltr"
              aria-invalid={days === null}
              value={leadDays}
              onChange={(e) => setLeadDays(e.target.value)}
            />
          </Field>
        </div>
        <label className="flex min-h-11 items-start gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="mt-0.5 size-5"
            checked={monthly}
            onChange={(e) => setMonthly(e.target.checked)}
          />
          <span>
            {t('monthly')}
            <span className="block font-normal text-muted">{t('monthlyHint')}</span>
          </span>
        </label>
        <ApiErrorAlert error={save.error} />
        {save.isSuccess && <Alert tone="success">{t('saved')}</Alert>}
        <Button type="submit" disabled={save.isPending || km === null || days === null}>
          {tCommon('save')}
        </Button>
      </form>
    </Card>
  );
}
