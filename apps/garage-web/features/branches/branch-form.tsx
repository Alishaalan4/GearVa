'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type CreateBranchInput, createBranchSchema } from '@gearva/contracts';
import { Button, Field, Input } from '@gearva/ui';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ApiErrorAlert } from '@/components/api-error';

type FormInput = z.input<typeof createBranchSchema>;

/** Name, address and phone of a branch, validated with the API's schema. */
export function BranchForm({
  defaultValues = { name: '', address: '', phone: '' },
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  defaultValues?: FormInput;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  /** Resolves true when saved; a new-branch form is then cleared. */
  onSubmit: (values: CreateBranchInput) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const t = useTranslations('branches');
  const tCommon = useTranslations('common');
  const form = useForm<FormInput, unknown, CreateBranchInput>({
    resolver: zodResolver(createBranchSchema),
    defaultValues,
  });
  const { errors } = form.formState;

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        if ((await onSubmit(values)) && !onCancel) form.reset();
      })}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('name')} error={errors.name && t('invalid.name')}>
          <Input aria-invalid={!!errors.name} {...form.register('name')} />
        </Field>
        <Field label={t('address')} error={errors.address && t('invalid.address')}>
          <Input aria-invalid={!!errors.address} {...form.register('address')} />
        </Field>
        <Field label={t('phone')} error={errors.phone && t('invalid.phone')}>
          <Input type="tel" dir="ltr" aria-invalid={!!errors.phone} {...form.register('phone')} />
        </Field>
      </div>
      <ApiErrorAlert error={error} />
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
