'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateCustomerInput,
  type CreateCustomerResponse,
  createCustomerSchema,
} from '@gearva/contracts';
import { Button, Card, Field, Input, Textarea } from '@gearva/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ApiErrorAlert } from '@/components/api-error';
import { useRouter } from '@/i18n/navigation';
import { apiPost } from '@/lib/api';

/**
 * flow.md 3.1: name and phone. A phone this garage already has opens that customer
 * instead of creating a duplicate (flow.md 13).
 */
export function NewCustomerForm({ phone = '' }: { phone?: string }) {
  const t = useTranslations('customers');
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<z.input<typeof createCustomerSchema>, unknown, CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: { name: '', phone, notes: '' },
  });
  const { errors } = form.formState;

  const create = useMutation({
    mutationFn: (values: CreateCustomerInput) =>
      apiPost<CreateCustomerResponse>('/v1/customers', values),
    onSuccess: (customer) => {
      queryClient.setQueryData(['customer', customer.id], customer);
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      router.push(
        customer.created
          ? `/customers/${customer.id}`
          : { pathname: `/customers/${customer.id}`, query: { existing: '1' } },
      );
    },
  });

  return (
    <form
      className="mx-auto max-w-xl space-y-6"
      noValidate
      onSubmit={form.handleSubmit((values) => create.mutate(values))}
    >
      <h1 className="text-2xl font-semibold">{t('newTitle')}</h1>
      <Card>
        <div className="space-y-4">
          <Field label={t('name')} error={errors.name && t('invalid.name')}>
            <Input autoFocus aria-invalid={!!errors.name} {...form.register('name')} />
          </Field>
          <Field
            label={t('phone')}
            hint={t('phoneHint')}
            error={errors.phone && t('invalid.phone')}
          >
            <Input
              type="tel"
              inputMode="tel"
              dir="ltr"
              aria-invalid={!!errors.phone}
              {...form.register('phone')}
            />
          </Field>
          <Field label={t('notes')} error={errors.notes && t('invalid.notes')}>
            <Textarea rows={2} {...form.register('notes')} />
          </Field>
        </div>
      </Card>
      <ApiErrorAlert error={create.error} />
      <Button type="submit" className="w-full sm:w-auto" disabled={create.isPending}>
        {t('submit')}
      </Button>
    </form>
  );
}
