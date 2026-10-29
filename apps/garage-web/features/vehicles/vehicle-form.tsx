'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateVehicleInput,
  DISTANCE_UNITS,
  type PlateExistsDetails,
  createVehicleSchema,
} from '@gearva/contracts';
import { Alert, Button, Field, Input, Textarea } from '@gearva/ui';
import { useTranslations } from 'next-intl';
import { type Resolver, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { ApiErrorAlert } from '@/components/api-error';
import { SuggestInput } from '@/components/suggest-input';
import { Link } from '@/i18n/navigation';
import { ApiError } from '@/lib/api';

type FormInput = z.input<typeof createVehicleSchema>;
/** What the form returns: the odometer only when creating a car. */
export type VehicleFormValues = Omit<CreateVehicleInput, 'odometer'> & { odometer?: number };
const editSchema = createVehicleSchema.omit({ odometer: true });
/** Empty number fields are "not given", not 0. */
const optionalNumber = (v: unknown) => (v === '' || v === null ? null : Number(v));

/**
 * flow.md 3.2: plate, make, model (autocomplete), year, unit and odometer. When editing,
 * the odometer is not shown: it changes only with a visit.
 */
export function VehicleForm({
  mode,
  defaultValues,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  mode: 'create' | 'edit';
  defaultValues?: Partial<FormInput>;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (values: VehicleFormValues) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations('vehicles');
  const tCommon = useTranslations('common');
  const tUnits = useTranslations('units');
  const form = useForm<FormInput, unknown, VehicleFormValues>({
    // Both schemas share every field; editing just leaves the odometer out.
    resolver: (mode === 'create'
      ? zodResolver(createVehicleSchema)
      : zodResolver(editSchema)) as Resolver<FormInput, unknown, VehicleFormValues>,
    defaultValues: {
      plate: '',
      make: '',
      model: '',
      year: null,
      distanceUnit: 'KM',
      notes: '',
      ...defaultValues,
    },
  });
  const unit = useWatch({ control: form.control, name: 'distanceUnit' });
  const { errors } = form.formState;
  const plateExists =
    error instanceof ApiError && error.code === 'VEHICLE_PLATE_EXISTS'
      ? (error.details as unknown as PlateExistsDetails)
      : null;

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={form.handleSubmit((values) => onSubmit(values))}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('plate')} error={errors.plate && t('invalid.plate')}>
          <Input
            autoFocus={mode === 'create'}
            dir="ltr"
            autoCapitalize="characters"
            className="font-mono text-lg"
            aria-invalid={!!errors.plate}
            {...form.register('plate')}
          />
        </Field>
        <Field label={t('year')} error={errors.year && t('invalid.year')}>
          <Input
            inputMode="numeric"
            dir="ltr"
            aria-invalid={!!errors.year}
            {...form.register('year', { setValueAs: optionalNumber })}
          />
        </Field>
        <Field label={t('make')} error={errors.make && t('invalid.make')}>
          <SuggestInput
            field="VEHICLE_MAKE"
            aria-invalid={!!errors.make}
            {...form.register('make')}
          />
        </Field>
        <Field label={t('model')} error={errors.model && t('invalid.model')}>
          <SuggestInput
            field="VEHICLE_MODEL"
            aria-invalid={!!errors.model}
            {...form.register('model')}
          />
        </Field>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-slate-700">{t('unit')}</legend>
          <div className="flex gap-6 pt-1 text-sm">
            {DISTANCE_UNITS.map((u) => (
              <label key={u} className="flex items-center gap-2">
                <input type="radio" value={u} {...form.register('distanceUnit')} />
                {t(`unitNames.${u}`)}
              </label>
            ))}
          </div>
        </fieldset>
        {mode === 'create' ? (
          <Field
            label={t('odometer', { unit: tUnits(unit ?? 'KM') })}
            error={errors.odometer && t('invalid.odometer')}
          >
            <Input
              inputMode="numeric"
              dir="ltr"
              aria-invalid={!!errors.odometer}
              {...form.register('odometer', { setValueAs: optionalNumber })}
            />
          </Field>
        ) : (
          <p className="self-end text-xs text-slate-500">{t('odometerFixed')}</p>
        )}
        <div className="sm:col-span-2">
          <Field label={t('notes')}>
            <Textarea rows={2} {...form.register('notes')} />
          </Field>
        </div>
      </div>

      {plateExists ? (
        <Alert>
          {t('plateExists', {
            make: plateExists.vehicle.make,
            model: plateExists.vehicle.model,
            name: plateExists.customer.name,
          })}{' '}
          <Link href={`/vehicles/${plateExists.vehicle.id}`} className="font-medium underline">
            {t('openExisting')}
          </Link>
        </Alert>
      ) : (
        <ApiErrorAlert error={error} />
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {tCommon('cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
