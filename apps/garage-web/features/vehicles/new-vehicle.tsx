'use client';

import type { CreateVehicleInput, CustomerDetail, VehicleDetail } from '@gearva/contracts';
import { Card } from '@gearva/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ApiErrorAlert } from '@/components/api-error';
import { Link, useRouter } from '@/i18n/navigation';
import { api, apiPost } from '@/lib/api';
import { VehicleForm } from './vehicle-form';

/** flow.md 3.2.1: a car for a customer who is already known (no name or phone asked). */
export function NewVehicle({ customerId }: { customerId: string }) {
  const t = useTranslations('vehicles');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const queryClient = useQueryClient();

  const customer = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => api<CustomerDetail>(`/v1/customers/${customerId}`),
    refetchOnWindowFocus: false,
  });
  const create = useMutation({
    mutationFn: (values: CreateVehicleInput) =>
      apiPost<VehicleDetail>(`/v1/customers/${customerId}/vehicles`, values),
    onSuccess: (vehicle) => {
      queryClient.setQueryData(['vehicle', vehicle.id], vehicle);
      void queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      router.push(`/vehicles/${vehicle.id}`);
    },
  });

  if (customer.isPending) return <p className="text-sm text-slate-500">{tCommon('loading')}</p>;
  if (customer.error) return <ApiErrorAlert error={customer.error} />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={`/customers/${customerId}`}
        className="text-sm text-slate-600 hover:text-slate-900"
      >
        {t('backToCustomer', { name: customer.data.name })}
      </Link>
      <h1 className="text-2xl font-semibold">{t('newTitle', { name: customer.data.name })}</h1>
      <Card>
        <VehicleForm
          mode="create"
          submitLabel={t('submit')}
          pending={create.isPending}
          error={create.error}
          onSubmit={(values) => create.mutate(values as CreateVehicleInput)}
        />
      </Card>
    </div>
  );
}
