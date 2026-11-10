'use client';

import {
  type SystemSettings,
  centsToDecimal,
  dollarsToCents,
  updateSystemSettingsSchema,
} from '@gearva/contracts';
import { Alert, Button, Card, Field, Input } from '@gearva/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiErrorAlert } from '@/components/api-error';
import { useAdmin } from '@/features/auth/use-admin';
import { apiPatch } from '@/lib/api';
import { ServiceTypesCard } from './service-types-card';
import { SETTINGS_QUERY_KEY, useSystemSettings } from './use-system-settings';

const MONEY = ['yearPriceCents', 'extraBranchPriceCents'] as const;
const GROUPS: { title: string; fields: (keyof SystemSettings)[] }[] = [
  { title: 'subscription', fields: ['trialDays', 'yearPriceCents', 'extraBranchPriceCents'] },
  {
    title: 'reminders',
    fields: [
      'reminderDaytimeStartHour',
      'reminderDaytimeEndHour',
      'reminderFollowUps',
      'reminderFollowUpDays',
      'reminderMaxPerGaragePerMonth',
    ],
  },
  { title: 'usage', fields: ['defaultDailyKm'] },
];

type Values = Record<keyof SystemSettings, string>;

function toValues(s: SystemSettings): Values {
  const v = {} as Values;
  for (const key of Object.keys(s) as (keyof SystemSettings)[]) {
    v[key] = (MONEY as readonly string[]).includes(key) ? centsToDecimal(s[key]) : String(s[key]);
  }
  return v;
}

/** flow.md 11.4: platform settings and default service types. Super admins change them. */
export function SettingsPage() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const admin = useAdmin();
  const settings = useSystemSettings();
  const canEdit = admin.data?.role === 'SUPER_ADMIN';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      {!canEdit && <p className="text-sm text-muted">{t('readOnly')}</p>}
      {settings.isPending && <p className="text-sm text-muted">{tCommon('loading')}</p>}
      <ApiErrorAlert error={settings.error} />
      {settings.data && <SettingsForm settings={settings.data} canEdit={canEdit} />}
      <ServiceTypesCard canEdit={canEdit} />
    </div>
  );
}

function SettingsForm({ settings, canEdit }: { settings: SystemSettings; canEdit: boolean }) {
  const t = useTranslations('settings');
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const form = useForm<Values>({ values: toValues(settings) });
  const save = useMutation({
    mutationFn: (body: Partial<SystemSettings>) =>
      apiPatch<SystemSettings>('/admin/v1/settings', body),
    onMutate: () => setSaved(false),
    onSuccess: (updated) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEY, updated);
      setSaved(true);
    },
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit((v) => {
    const body: Record<string, number | null> = {};
    for (const key of Object.keys(v) as (keyof SystemSettings)[]) {
      const text = v[key].trim();
      body[key] = (MONEY as readonly string[]).includes(key)
        ? text === ''
          ? null
          : dollarsToCents(text)
        : /^\d+$/.test(text)
          ? Number(text)
          : null;
    }
    const parsed = updateSystemSettingsSchema.safeParse(body);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        form.setError(issue.path[0] as keyof SystemSettings, { type: 'invalid' });
      }
      return;
    }
    save.mutate(parsed.data);
  });

  return (
    <form noValidate onSubmit={submit}>
      <fieldset disabled={!canEdit} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {GROUPS.map((group) => (
            <Card key={group.title} title={t(`groups.${group.title}`)}>
              <div className="space-y-3">
                {group.fields.map((key) => (
                  <Field
                    key={key}
                    label={t(`fields.${key}`)}
                    hint={t(`hints.${key}`)}
                    error={errors[key] && t('invalid')}
                  >
                    <Input
                      inputMode={(MONEY as readonly string[]).includes(key) ? 'decimal' : 'numeric'}
                      dir="ltr"
                      aria-invalid={!!errors[key]}
                      {...form.register(key)}
                    />
                  </Field>
                ))}
              </div>
            </Card>
          ))}
        </div>
        {saved && <Alert tone="success">{t('saved')}</Alert>}
        <ApiErrorAlert error={save.error} />
        {canEdit && (
          <Button type="submit" disabled={save.isPending}>
            {t('save')}
          </Button>
        )}
      </fieldset>
    </form>
  );
}
