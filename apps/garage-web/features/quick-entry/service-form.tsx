'use client';

import {
  type OdometerConfirmationDetails,
  type PrefillResponse,
  type ServiceLineInput,
  type SuggestionField,
  type VehicleDetail,
  type VisitDetail,
  OTHER_SERVICE_CODE,
  fromKm,
  resolveInterval,
  serviceLineSchema,
  toKm,
} from '@gearva/contracts';
import { Alert, Button, Card, Field, Input, Select, Textarea } from '@gearva/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { ApiErrorAlert } from '@/components/api-error';
import { SuggestInput } from '@/components/suggest-input';
import { useRouter } from '@/i18n/navigation';
import { ApiError, api, apiPost } from '@/lib/api';
import { calendarDate, centsToDecimal, dollarsToCents, useDistance } from '@/lib/format';
import { useServiceName } from './service-picker';

/** The detail fields of each `detailKey` (database.md 4.4); all optional. */
type DetailField =
  | { key: string; kind: 'text'; suggest?: SuggestionField }
  | { key: string; kind: 'int' | 'decimal' }
  | { key: string; kind: 'bool' }
  | { key: string; kind: 'choice'; options: readonly string[] };

const DETAIL_FIELDS: Record<string, DetailField[]> = {
  oil: [
    { key: 'brand', kind: 'text', suggest: 'OIL_BRAND' },
    { key: 'grade', kind: 'text', suggest: 'OIL_GRADE' },
    { key: 'liters', kind: 'decimal' },
    { key: 'filterChanged', kind: 'bool' },
    { key: 'filterBrand', kind: 'text', suggest: 'FILTER_BRAND' },
  ],
  wheels: [
    { key: 'tireBrand', kind: 'text', suggest: 'TIRE_BRAND' },
    { key: 'tireSize', kind: 'text' },
    { key: 'alignment', kind: 'bool' },
    { key: 'balancing', kind: 'bool' },
    { key: 'rotation', kind: 'bool' },
  ],
  battery: [
    { key: 'brand', kind: 'text', suggest: 'BATTERY_BRAND' },
    { key: 'amps', kind: 'int' },
    { key: 'warrantyMonths', kind: 'int' },
  ],
  brakes: [
    { key: 'position', kind: 'choice', options: ['FRONT', 'REAR'] },
    { key: 'part', kind: 'choice', options: ['PADS', 'DISCS'] },
    { key: 'padBrand', kind: 'text', suggest: 'BRAKE_PAD_BRAND' },
  ],
  ac: [
    { key: 'gasRefill', kind: 'bool' },
    { key: 'filterChanged', kind: 'bool' },
    { key: 'compressor', kind: 'bool' },
  ],
};

interface FormValues {
  odometer: string;
  quantity: string;
  price: string;
  customName: string;
  details: Record<string, string | boolean>;
  labor: string;
  parts: string;
  notes: string;
  warrantyUntil: string;
  recommendedNote: string;
  recommendedAfterMonths: string;
  noReminder: boolean;
  nextDueOdometer: string;
  nextDueDate: string;
}

const digits = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : null);

/** Form text for the API's `details`: empty values are left out. */
function detailsFor(fields: DetailField[], values: Record<string, string | boolean>) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.key];
    if (f.kind === 'bool') {
      if (v === true) out[f.key] = true;
    } else if (typeof v === 'string' && v.trim() !== '') {
      out[f.key] = f.kind === 'int' || f.kind === 'decimal' ? Number(v) : v.trim();
    }
  }
  return out;
}

/** The last values for this car, as form text (flow.md 4.1 step 3, "last used"). */
function lastDetails(fields: DetailField[], last: PrefillResponse['last']) {
  const out: Record<string, string | boolean> = {};
  for (const f of fields) {
    const v = last?.details[f.key];
    out[f.key] = f.kind === 'bool' ? v === true : v === undefined ? '' : String(v);
  }
  return out;
}

/**
 * The pre-filled service form (flow.md 4.1 steps 3-5). Without `visit` it is quick entry
 * (a new visit, saved in one request); with `visit` it adds a service to an open visit.
 */
export function ServiceForm({
  vehicle,
  serviceTypeId,
  visit,
}: {
  vehicle: VehicleDetail;
  serviceTypeId: string;
  visit?: Pick<VisitDetail, 'id' | 'odometerKm'>;
}) {
  const prefill = useQuery({
    queryKey: ['prefill', vehicle.id, serviceTypeId],
    queryFn: () =>
      api<PrefillResponse>(`/v1/vehicles/${vehicle.id}/prefill?serviceTypeId=${serviceTypeId}`),
    // Always fresh: it carries today's estimate and the latest "last used" values.
    staleTime: 0,
  });
  const tCommon = useTranslations('common');
  if (prefill.isPending) return <p className="text-sm text-muted">{tCommon('loading')}</p>;
  if (prefill.error) return <ApiErrorAlert error={prefill.error} />;
  return (
    <LoadedForm
      vehicle={vehicle}
      serviceTypeId={serviceTypeId}
      visit={visit}
      prefill={prefill.data}
    />
  );
}

function LoadedForm({
  vehicle,
  serviceTypeId,
  visit,
  prefill,
}: {
  vehicle: VehicleDetail;
  serviceTypeId: string;
  visit?: Pick<VisitDetail, 'id' | 'odometerKm'>;
  prefill: PrefillResponse;
}) {
  const t = useTranslations('quick');
  const format = useFormatter();
  const distance = useDistance();
  const serviceName = useServiceName();
  const router = useRouter();
  const queryClient = useQueryClient();
  const unit = vehicle.distanceUnit;
  const type = prefill.serviceType;
  const fields = DETAIL_FIELDS[type.detailKey ?? ''] ?? [];
  const isOther = type.code === OTHER_SERVICE_CODE;
  const interval = resolveInterval(unit, type);
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirm, setConfirm] = useState<OdometerConfirmationDetails | null>(null);

  const form = useForm<FormValues>({
    defaultValues: {
      odometer: String(visit ? fromKm(visit.odometerKm, unit) : prefill.estimatedOdometer),
      quantity: prefill.last ? String(Number(prefill.last.quantity)) : '1',
      price: prefill.last ? centsToDecimal(prefill.last.unitPriceCents) : '',
      customName: '',
      details: lastDetails(fields, prefill.last),
      labor: '',
      parts: '',
      notes: '',
      warrantyUntil: '',
      recommendedNote: '',
      recommendedAfterMonths: '',
      noReminder: false,
      nextDueOdometer: '',
      nextDueDate: '',
    },
  });
  const { errors } = form.formState;
  const odometerText = useWatch({ control: form.control, name: 'odometer' });
  const filterChanged = useWatch({ control: form.control, name: 'details.filterChanged' });
  const noReminder = useWatch({ control: form.control, name: 'noReminder' });

  // flow.md 6, live: the next due km follows the odometer being typed.
  const odometerKm = toKm(digits(odometerText) ?? 0, unit);
  const nextKm = interval.intervalKm ? odometerKm + interval.intervalKm : null;
  const nextDate = prefill.nextDueDate;

  const save = useMutation({
    mutationFn: (body: { line: ServiceLineInput; finish: boolean; confirmOdometer?: string }) =>
      visit
        ? apiPost<VisitDetail>(`/v1/visits/${visit.id}/records`, { services: [body.line] })
        : apiPost<VisitDetail>('/v1/visits/quick', {
            vehicleId: vehicle.id,
            odometer: digits(odometerText),
            services: [body.line],
            // "Paid now?" comes next, on the visit page, so the visit stays open until then.
            finish: false,
            confirmOdometer: body.confirmOdometer,
          }),
    onSuccess: (saved, body) => {
      queryClient.setQueryData(['visit', saved.id], saved);
      for (const key of [
        ['vehicle', vehicle.id],
        ['history', vehicle.id],
        ['prefill', vehicle.id],
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      void queryClient.invalidateQueries({ queryKey: ['customer', vehicle.customer.id] });
      router.push(
        !visit && body.finish
          ? { pathname: `/visits/${saved.id}`, query: { finish: '1' } }
          : `/visits/${saved.id}`,
      );
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'ODOMETER_CONFIRMATION_REQUIRED') {
        setConfirm(error.details as unknown as OdometerConfirmationDetails);
      }
    },
  });
  const [lastRequest, setLastRequest] = useState<{
    line: ServiceLineInput;
    finish: boolean;
  } | null>(null);

  /** Builds the API line from the form, with the API's own schema as the final check. */
  function toLine(values: FormValues): ServiceLineInput | null {
    let ok = true;
    const fail = (name: keyof FormValues | 'details', message: string) => {
      form.setError(name as keyof FormValues, { message });
      ok = false;
    };
    if (!visit && digits(values.odometer) === null) fail('odometer', t('invalid.odometer'));
    const unitPriceCents = dollarsToCents(values.price);
    if (unitPriceCents === null) fail('price', t('invalid.price'));
    const laborCents = values.labor ? dollarsToCents(values.labor) : null;
    const partsCents = values.parts ? dollarsToCents(values.parts) : null;
    if (values.labor && laborCents === null) fail('labor', t('invalid.price'));
    if (values.parts && partsCents === null) fail('parts', t('invalid.price'));
    if (isOther && values.customName.trim().length < 2) fail('customName', t('invalid.customName'));

    // Next due: left out when unchanged (the API computes the same), null when switched off.
    const typedNextKm = digits(values.nextDueOdometer);
    const shownNext = nextKm === null ? '' : String(fromKm(nextKm, unit));
    const nextDueOdometer = values.noReminder
      ? null
      : values.nextDueOdometer.trim() === '' || values.nextDueOdometer.trim() === shownNext
        ? undefined
        : typedNextKm;
    const nextDueDate = values.noReminder
      ? null
      : values.nextDueDate && values.nextDueDate !== (nextDate ?? '')
        ? values.nextDueDate
        : undefined;
    if (!ok) return null;

    const parsed = serviceLineSchema.safeParse({
      serviceTypeId,
      customName: isOther ? values.customName : undefined,
      quantity: values.quantity.trim() || '1',
      unitPriceCents,
      laborCents,
      partsCents,
      notes: values.notes.trim() || undefined,
      details: detailsFor(fields, values.details),
      warrantyUntil: values.warrantyUntil || undefined,
      recommendedNote: values.recommendedNote.trim() || undefined,
      recommendedAfterMonths: digits(values.recommendedAfterMonths) ?? undefined,
      nextDueOdometer,
      nextDueDate,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const name = String(issue?.path[0] ?? 'quantity');
      const known = ['quantity', 'customName', 'notes', 'recommendedAfterMonths'];
      form.setError((known.includes(name) ? name : 'quantity') as keyof FormValues, {
        message: t('invalid.check'),
      });
      return null;
    }
    return parsed.data;
  }

  const submit = (finish: boolean) =>
    form.handleSubmit((values) => {
      const line = toLine(values);
      if (!line) return;
      setConfirm(null);
      setLastRequest({ line, finish });
      save.mutate({ line, finish });
    });

  const fieldError = (name: keyof FormValues) => errors[name]?.message as string | undefined;

  return (
    <form className="space-y-4" noValidate onSubmit={(e) => e.preventDefault()}>
      <h1 className="text-2xl font-extrabold">{serviceName(type)}</h1>
      <p className="font-mono text-sm text-muted" dir="ltr">
        {vehicle.plate} · {vehicle.make} {vehicle.model}
      </p>

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          {visit ? (
            <p className="text-sm text-muted sm:col-span-2">
              {t('visitOdometer', { value: distance(visit.odometerKm, unit) })}
            </p>
          ) : (
            <Field
              label={t('odometer', { unit: t(`units.${unit}`) })}
              hint={t('odometerHint', { value: distance(prefill.estimatedKm, unit) })}
              error={fieldError('odometer')}
            >
              <Input
                inputMode="numeric"
                dir="ltr"
                className="text-lg"
                aria-invalid={!!errors.odometer}
                {...form.register('odometer')}
              />
            </Field>
          )}
          {isOther && (
            <Field label={t('customName')} error={fieldError('customName')}>
              <SuggestInput
                field="SERVICE_NAME"
                aria-invalid={!!errors.customName}
                {...form.register('customName')}
              />
            </Field>
          )}
          <Field label={t('price')} hint={t('priceHint')} error={fieldError('price')}>
            <Input
              inputMode="decimal"
              dir="ltr"
              aria-invalid={!!errors.price}
              {...form.register('price')}
            />
          </Field>
          <Field label={t('quantity')} error={fieldError('quantity')}>
            <Input
              inputMode="decimal"
              dir="ltr"
              aria-invalid={!!errors.quantity}
              {...form.register('quantity')}
            />
          </Field>
          {fields.map((f) => {
            const label = t(`details.${f.key}`);
            const name = `details.${f.key}` as const;
            if (f.kind === 'bool') {
              return (
                <label key={f.key} className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" className="size-5" {...form.register(name)} />
                  {label}
                </label>
              );
            }
            if (f.kind === 'choice') {
              return (
                <Field key={f.key} label={label}>
                  <Select {...form.register(name)}>
                    <option value="">—</option>
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {t(`choices.${o}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
              );
            }
            if (f.key === 'filterBrand' && filterChanged !== true) return null;
            return (
              <Field key={f.key} label={label}>
                {f.kind === 'text' && f.suggest ? (
                  <SuggestInput field={f.suggest} {...form.register(name)} />
                ) : (
                  <Input
                    inputMode={f.kind === 'text' ? undefined : 'decimal'}
                    dir={f.kind === 'text' ? undefined : 'ltr'}
                    {...form.register(name)}
                  />
                )}
              </Field>
            );
          })}
        </div>

        {prefill.last && (
          <p className="mt-3 text-xs text-muted">
            {t('lastUsed', {
              date: format.dateTime(new Date(prefill.last.performedAt), { dateStyle: 'medium' }),
            })}
          </p>
        )}
        <div className="mt-4 rounded-[10px] bg-tint px-3.5 py-3 text-sm font-semibold">
          {noReminder
            ? t('noReminderSet')
            : nextKm === null && !nextDate
              ? t('noInterval')
              : t('nextDue', {
                  value: [
                    nextKm !== null ? distance(nextKm, unit) : null,
                    nextDate
                      ? format.dateTime(calendarDate(nextDate), { dateStyle: 'medium' })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(t('or')),
                })}
        </div>
      </Card>

      <button
        type="button"
        className="text-sm font-medium text-soft-ink underline"
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen((v) => !v)}
      >
        {moreOpen ? t('lessDetails') : t('moreDetails')}
      </button>
      {moreOpen && (
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('labor')} error={fieldError('labor')}>
              <Input inputMode="decimal" dir="ltr" {...form.register('labor')} />
            </Field>
            <Field label={t('parts')} error={fieldError('parts')}>
              <Input inputMode="decimal" dir="ltr" {...form.register('parts')} />
            </Field>
            <Field label={t('warrantyUntil')}>
              <Input type="date" {...form.register('warrantyUntil')} />
            </Field>
            <Field label={t('recommendedAfterMonths')} error={fieldError('recommendedAfterMonths')}>
              <Input inputMode="numeric" dir="ltr" {...form.register('recommendedAfterMonths')} />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t('recommendedNote')}>
                <Input {...form.register('recommendedNote')} />
              </Field>
            </div>
            <Field
              label={t('nextDueOdometer', { unit: t(`units.${unit}`) })}
              hint={t('nextDueHint')}
            >
              <Input
                inputMode="numeric"
                dir="ltr"
                disabled={noReminder}
                placeholder={nextKm === null ? '' : String(fromKm(nextKm, unit))}
                {...form.register('nextDueOdometer')}
              />
            </Field>
            <Field label={t('nextDueDate')}>
              <Input type="date" disabled={noReminder} {...form.register('nextDueDate')} />
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="size-5" {...form.register('noReminder')} />
              {t('noReminder')}
            </label>
            <div className="sm:col-span-2">
              <Field label={t('notes')}>
                <Textarea rows={2} {...form.register('notes')} />
              </Field>
            </div>
          </div>
        </Card>
      )}

      {confirm ? (
        <Alert>
          <p className="font-medium">
            {t(confirm.check === 'CORRECTION' ? 'confirmLower' : 'confirmJump', {
              previous: distance(confirm.previousKm, unit),
              value: distance(confirm.newKm, unit),
            })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={save.isPending}
              onClick={() => {
                if (!lastRequest) return;
                save.mutate({ ...lastRequest, confirmOdometer: confirm.check });
              }}
            >
              {t('confirmYes')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setConfirm(null);
                save.reset();
                form.setFocus('odometer');
              }}
            >
              {t('confirmFix')}
            </Button>
          </div>
        </Alert>
      ) : (
        <ApiErrorAlert error={save.error} />
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          className="py-3 text-base"
          disabled={save.isPending}
          onClick={submit(!visit)}
        >
          {visit ? t('addToVisit') : t('confirmFinish')}
        </Button>
        {!visit && (
          <Button
            type="button"
            variant="secondary"
            className="py-3 text-base"
            disabled={save.isPending}
            onClick={submit(false)}
          >
            {t('confirmAnother')}
          </Button>
        )}
      </div>
    </form>
  );
}
