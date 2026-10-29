'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CustomerDetail,
  type UpdateCustomerInput,
  updateCustomerSchema,
} from '@gearva/contracts';
import { Alert, Button, Card, Field, Input, Textarea } from '@gearva/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ApiErrorAlert } from '@/components/api-error';
import { Link } from '@/i18n/navigation';
import { ApiError, api, apiPatch } from '@/lib/api';
import { useDistance } from '@/lib/format';

/** flow.md 3.1, 3.2.1: the customer's file, their cars, and "Add car". */
export function CustomerPage({ customerId, existing }: { customerId: string; existing: boolean }) {
  const t = useTranslations('customers');
  const tCommon = useTranslations('common');
  const distance = useDistance();
  const [editing, setEditing] = useState(false);

  const customer = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => api<CustomerDetail>(`/v1/customers/${customerId}`),
    // Each load writes a customer.view audit row (flow.md 12): no refetch on tab focus.
    refetchOnWindowFocus: false,
  });

  if (customer.isPending) return <p className="text-sm text-slate-500">{tCommon('loading')}</p>;
  if (customer.error) {
    const missing = customer.error instanceof ApiError && customer.error.status === 404;
    return missing ? <Alert>{t('notFound')}</Alert> : <ApiErrorAlert error={customer.error} />;
  }
  const c = customer.data;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">
        {tCommon('backToSearch')}
      </Link>
      {existing && <Alert tone="success">{t('existing', { name: c.name })}</Alert>}

      <Card>
        {editing ? (
          <EditCustomer customer={c} onDone={() => setEditing(false)} />
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold">{c.name}</h1>
              <p className="text-slate-600" dir="ltr">
                {c.phone}
              </p>
              {c.notes && <p className="whitespace-pre-line text-sm text-slate-600">{c.notes}</p>}
              <div className="flex flex-wrap gap-2 pt-1 text-xs">
                {c.remindersOptOut && (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">
                    {t('remindersOptOut')}
                  </span>
                )}
                {c.marketingOptOut && (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">
                    {t('marketingOptOut')}
                  </span>
                )}
              </div>
            </div>
            <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
              {tCommon('edit')}
            </Button>
          </div>
        )}
      </Card>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('cars')}</h2>
          <Link
            href={`/customers/${c.id}/vehicles/new`}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            {t('addCar')}
          </Link>
        </div>
        {c.vehicles.length === 0 && <p className="text-sm text-slate-500">{t('noCars')}</p>}
        <ul className="space-y-2">
          {c.vehicles.map((v) => (
            <li key={v.id}>
              <Link
                href={`/vehicles/${v.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-400"
              >
                <div>
                  <p className="font-mono text-lg font-semibold" dir="ltr">
                    {v.plate}
                  </p>
                  <p className="text-sm text-slate-700">
                    {v.make} {v.model}
                    {v.year ? ` · ${v.year}` : ''}
                  </p>
                </div>
                <p className="text-sm text-slate-500">{distance(v.currentKm, v.distanceUnit)}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The garage's own data about the customer; the phone is the owner's identity. */
function EditCustomer({ customer, onDone }: { customer: CustomerDetail; onDone: () => void }) {
  const t = useTranslations('customers');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const form = useForm<z.input<typeof updateCustomerSchema>, unknown, UpdateCustomerInput>({
    resolver: zodResolver(updateCustomerSchema),
    defaultValues: {
      name: customer.name,
      notes: customer.notes ?? '',
      remindersOptOut: customer.remindersOptOut,
      marketingOptOut: customer.marketingOptOut,
    },
  });
  const { errors } = form.formState;
  const save = useMutation({
    mutationFn: (values: UpdateCustomerInput) =>
      apiPatch<CustomerDetail>(`/v1/customers/${customer.id}`, values),
    onSuccess: (updated) => {
      queryClient.setQueryData(['customer', customer.id], updated);
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['search'] });
      onDone();
    },
  });

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      <Field label={t('name')} error={errors.name && t('invalid.name')}>
        <Input aria-invalid={!!errors.name} {...form.register('name')} />
      </Field>
      <Field label={t('phone')} hint={t('phoneFixed')}>
        <Input value={customer.phone} dir="ltr" disabled readOnly />
      </Field>
      <Field label={t('notes')} error={errors.notes && t('invalid.notes')}>
        <Textarea rows={2} {...form.register('notes')} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...form.register('remindersOptOut')} />
        {t('remindersOptOut')}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...form.register('marketingOptOut')} />
        {t('marketingOptOut')}
      </label>
      <ApiErrorAlert error={save.error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={save.isPending}>
          {tCommon('save')}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          {tCommon('cancel')}
        </Button>
      </div>
    </form>
  );
}
