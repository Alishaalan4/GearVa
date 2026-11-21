'use client';

import { type ReminderSettings, updateReminderSettingsSchema } from '@gearva/contracts';
import { Alert, Button, Card, Field, Input } from '@gearva/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { useAdmin } from '@/features/auth/use-admin';
import { useSystemSettings } from '@/features/settings/use-system-settings';
import { api, apiPatch } from '@/lib/api';

/** The km an example service is due at, and its due date, for the live explanations. */
const EXAMPLE_KM = 85_000;
const EXAMPLE_DUE_DATE = '2027-03-01';

/**
 * Step 7.4 (flow.md 9.1 to 9.3, user decision 2026-11-21): a garage's reminder settings,
 * set by Gearva on the garage's page (the garage app no longer has them). Any admin reads,
 * super admins change. Each setting says what it does, with an example that follows the
 * value being typed, and the rules that are the same for every garage come from Settings.
 */
export function ReminderSettingsCard({ garageId }: { garageId: string }) {
  const t = useTranslations('reminderAdmin');
  const tCommon = useTranslations('common');
  const canChange = useAdmin().data?.role === 'SUPER_ADMIN';
  const key = ['garage', garageId, 'reminder-settings'];
  const settings = useQuery({
    queryKey: key,
    queryFn: () => api<ReminderSettings>(`/admin/v1/garages/${garageId}/reminder-settings`),
  });

  return (
    <Card title={t('title')}>
      <div className="space-y-4">
        <p className="text-sm text-muted">{t('intro')}</p>
        {settings.isPending && <p className="text-sm text-muted">{tCommon('loading')}</p>}
        <ApiErrorAlert error={settings.error} />
        {settings.data && (
          <SettingsForm
            garageId={garageId}
            queryKey={key}
            settings={settings.data}
            canChange={canChange}
          />
        )}
        <SharedRules />
      </div>
    </Card>
  );
}

function SettingsForm({
  garageId,
  queryKey,
  settings,
  canChange,
}: {
  garageId: string;
  queryKey: string[];
  settings: ReminderSettings;
  canChange: boolean;
}) {
  const t = useTranslations('reminderAdmin');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [leadKm, setLeadKm] = useState(String(settings.reminderLeadKm));
  const [leadDays, setLeadDays] = useState(String(settings.reminderLeadDays));
  const [monthly, setMonthly] = useState(settings.monthlyReminderEnabled);
  const [saved, setSaved] = useState(false);

  const parsed = updateReminderSettingsSchema.safeParse({
    reminderLeadKm: /^\d+$/.test(leadKm) ? Number(leadKm) : -1,
    reminderLeadDays: /^\d+$/.test(leadDays) ? Number(leadDays) : -1,
    monthlyReminderEnabled: monthly,
  });
  const kmOk = /^\d+$/.test(leadKm) && Number(leadKm) <= 5000;
  const daysOk = /^\d+$/.test(leadDays) && Number(leadDays) <= 60;

  const save = useMutation({
    mutationFn: (body: object) =>
      apiPatch<ReminderSettings>(`/admin/v1/garages/${garageId}/reminder-settings`, body),
    onMutate: () => setSaved(false),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated);
      setSaved(true);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (parsed.success) save.mutate(parsed.data);
  };

  // The live examples follow what is typed (only when it is a valid number).
  const km = (n: number) => format.number(n);
  const fromKm = kmOk ? EXAMPLE_KM - Number(leadKm) : null;
  const fromDate = daysOk
    ? (() => {
        const d = new Date(`${EXAMPLE_DUE_DATE}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() - Number(leadDays));
        return format.dateTime(d, { dateStyle: 'long', timeZone: 'UTC' });
      })()
    : null;
  const dueDate = format.dateTime(new Date(`${EXAMPLE_DUE_DATE}T12:00:00Z`), {
    dateStyle: 'long',
    timeZone: 'UTC',
  });

  return (
    <form className="space-y-4" noValidate onSubmit={submit}>
      <fieldset disabled={!canChange} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Field label={t('leadKm')} error={kmOk ? undefined : t('leadKmInvalid')}>
              <Input
                inputMode="numeric"
                dir="ltr"
                value={leadKm}
                aria-invalid={!kmOk}
                onChange={(e) => setLeadKm(e.target.value.trim())}
              />
            </Field>
            <p className="text-xs text-muted">{t('leadKmHelp')}</p>
            {fromKm !== null && (
              <p className="rounded-lg bg-soft px-3 py-2 text-xs">
                {t('leadKmExample', { due: km(EXAMPLE_KM), from: km(fromKm) })}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Field label={t('leadDays')} error={daysOk ? undefined : t('leadDaysInvalid')}>
              <Input
                inputMode="numeric"
                dir="ltr"
                value={leadDays}
                aria-invalid={!daysOk}
                onChange={(e) => setLeadDays(e.target.value.trim())}
              />
            </Field>
            <p className="text-xs text-muted">{t('leadDaysHelp')}</p>
            {fromDate && (
              <p className="rounded-lg bg-soft px-3 py-2 text-xs">
                {t('leadDaysExample', { due: dueDate, from: fromDate })}
              </p>
            )}
          </div>
        </div>
        <p className="text-xs text-muted">{t('firstOfBoth')}</p>

        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={monthly}
              onChange={(e) => setMonthly(e.target.checked)}
            />
            {t('monthly')}
          </label>
          <p className="text-xs text-muted">{t('monthlyHelp')}</p>
        </div>

        {saved && <Alert tone="success">{t('saved')}</Alert>}
        <ApiErrorAlert error={save.error} />
        {canChange ? (
          <Button type="submit" disabled={save.isPending || !parsed.success}>
            {t('save')}
          </Button>
        ) : (
          <p className="text-xs text-muted">{t('superOnly')}</p>
        )}
      </fieldset>
    </form>
  );
}

/** The rules every garage shares (flow.md 9.1, 9.3), from the platform settings. */
function SharedRules() {
  const t = useTranslations('reminderAdmin');
  const system = useSystemSettings();
  if (!system.data) return null;
  const s = system.data;
  const hour = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return (
    <div className="space-y-1 rounded-lg border border-line p-3 text-xs">
      <p className="font-medium">{t('sharedTitle')}</p>
      <ul className="list-disc space-y-1 ps-4 text-muted">
        <li>{t('ruleChannel')}</li>
        <li>
          {t('ruleDaytime', {
            start: hour(s.reminderDaytimeStartHour),
            end: hour(s.reminderDaytimeEndHour),
          })}
        </li>
        <li>{t('ruleFollowUps', { count: s.reminderFollowUps, days: s.reminderFollowUpDays })}</li>
        <li>{t('ruleCap', { cap: s.reminderMaxPerGaragePerMonth })}</li>
        <li>{t('ruleOptOut')}</li>
        <li>{t('ruleEstimate', { km: s.defaultDailyKm })}</li>
      </ul>
      <p className="text-muted">{t('sharedWhere')}</p>
    </div>
  );
}
