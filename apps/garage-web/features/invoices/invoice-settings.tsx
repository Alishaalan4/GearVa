'use client';

import {
  type InvoiceSettings,
  LOGO_MAX_BYTES,
  type UpdateInvoiceSettingsInput,
  formatInvoiceNumber,
  isValidInvoiceNumberFormat,
  vatRateToHundredths,
} from '@gearva/contracts';
import { Alert, Button, Card, Field, Input, Textarea } from '@gearva/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { api, apiFile, apiPatch, apiUpload } from '@/lib/api';

const SETTINGS_KEY = ['invoice-settings'] as const;

function validRate(rate: string): boolean {
  try {
    vatRateToHundredths(rate);
    return true;
  } catch {
    return false;
  }
}

/** The garage's invoice settings and logo (database.md 4.2, flow.md 7.2). Owner only. */
export function InvoiceSettingsPage() {
  const tCommon = useTranslations('common');
  const settings = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => api<InvoiceSettings>('/v1/invoice-settings'),
  });
  if (settings.isPending) return <p className="text-sm text-muted">{tCommon('loading')}</p>;
  if (settings.error) return <ApiErrorAlert error={settings.error} />;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <LogoCard hasLogo={settings.data.hasLogo} />
      <SettingsForm settings={settings.data} />
    </div>
  );
}

function SettingsForm({ settings }: { settings: InvoiceSettings }) {
  const t = useTranslations('invoiceSettings');
  const queryClient = useQueryClient();
  const [brandColor, setBrandColor] = useState(settings.brandColor);
  const [numberFormat, setNumberFormat] = useState(settings.invoiceNumberFormat);
  const [terms, setTerms] = useState(settings.termsText ?? '');
  const [vatEnabled, setVatEnabled] = useState(settings.vatEnabled);
  const [vatRate, setVatRate] = useState(settings.vatRatePercent ?? '');
  const [vatNumber, setVatNumber] = useState(settings.vatNumber ?? '');
  const save = useMutation({
    mutationFn: (body: UpdateInvoiceSettingsInput) =>
      apiPatch<InvoiceSettings>('/v1/invoice-settings', body),
    onSuccess: (saved) => queryClient.setQueryData(SETTINGS_KEY, saved),
  });

  const formatOk = isValidInvoiceNumberFormat(numberFormat.trim());
  const rateOk = vatRate.trim() === '' ? !vatEnabled : validRate(vatRate);
  const example = formatOk
    ? formatInvoiceNumber(numberFormat.trim(), {
        branchCode: 'BR1',
        year: new Date().getFullYear(),
        seq: 7,
      })
    : null;

  return (
    <Card title={t('title')}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!formatOk || !rateOk) return;
          save.mutate({
            brandColor,
            invoiceNumberFormat: numberFormat.trim(),
            termsText: terms.trim() || null,
            vatEnabled,
            vatRatePercent: vatRate.trim() || null,
            vatNumber: vatNumber.trim() || null,
          });
        }}
      >
        <Field label={t('brandColor')} hint={t('brandColorHint')}>
          <input
            type="color"
            className="h-11 w-20 cursor-pointer rounded-[10px] border border-line bg-field"
            value={brandColor}
            onChange={(e) => setBrandColor(e.target.value)}
          />
        </Field>
        <Field
          label={t('numberFormat')}
          hint={example ? t('numberExample', { example }) : undefined}
          error={formatOk ? undefined : t('numberFormatInvalid')}
        >
          <Input
            dir="ltr"
            maxLength={40}
            aria-invalid={!formatOk}
            value={numberFormat}
            onChange={(e) => setNumberFormat(e.target.value)}
          />
        </Field>
        <Field label={t('terms')} hint={t('termsHint')}>
          <Textarea
            rows={3}
            maxLength={2000}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
          />
        </Field>

        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-5"
            checked={vatEnabled}
            onChange={(e) => setVatEnabled(e.target.checked)}
          />
          {t('vatEnabled')}
        </label>
        {vatEnabled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('vatRate')} error={rateOk ? undefined : t('vatRateInvalid')}>
              <Input
                inputMode="decimal"
                dir="ltr"
                aria-invalid={!rateOk}
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
              />
            </Field>
            <Field label={t('vatNumber')}>
              <Input
                dir="ltr"
                maxLength={40}
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
              />
            </Field>
          </div>
        )}
        <p className="text-xs text-muted">{t('appliesToNew')}</p>

        {save.isSuccess && !save.isPending && <Alert tone="success">{t('saved')}</Alert>}
        <ApiErrorAlert error={save.error} />
        <Button type="submit" disabled={save.isPending || !formatOk || !rateOk}>
          {t('save')}
        </Button>
      </form>
    </Card>
  );
}

/** The logo printed on invoices: PNG or JPEG, up to 1 MB (the API checks the bytes). */
function LogoCard({ hasLogo }: { hasLogo: boolean }) {
  const t = useTranslations('invoiceSettings');
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState<'logoTooBig' | 'logoType' | null>(null);
  const logo = useQuery({
    queryKey: ['invoice-logo'],
    queryFn: async () => URL.createObjectURL(await apiFile('/v1/invoice-settings/logo')),
    enabled: hasLogo,
  });
  const url = logo.data;
  // Frees the previous image once a new one replaces it.
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return apiUpload<InvoiceSettings>('/v1/invoice-settings/logo', body);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(SETTINGS_KEY, saved);
      void queryClient.invalidateQueries({ queryKey: ['invoice-logo'] });
    },
  });

  return (
    <Card title={t('logo')}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-44 items-center justify-center rounded-[10px] border border-line bg-white p-2">
          {hasLogo && url ? (
            // A blob from our own API: next/image cannot optimise it.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={t('logo')} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-muted">{t('noLogo')}</span>
          )}
        </div>
        <label className="cursor-pointer text-sm font-semibold underline">
          {hasLogo ? t('replaceLogo') : t('uploadLogo')}
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            disabled={upload.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const found =
                file.size > LOGO_MAX_BYTES
                  ? 'logoTooBig'
                  : ['image/png', 'image/jpeg'].includes(file.type)
                    ? null
                    : 'logoType';
              setProblem(found);
              if (!found) upload.mutate(file);
            }}
          />
        </label>
      </div>
      <p className="mt-3 text-xs text-muted">{t('logoHint')}</p>
      <div className="mt-3">
        {problem ? <Alert>{t(problem)}</Alert> : <ApiErrorAlert error={upload.error} />}
      </div>
    </Card>
  );
}
