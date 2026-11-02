'use client';

import type { UpdateVehicleInput, VehicleDetail } from '@gearva/contracts';
import { Alert, Button, Card } from '@gearva/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { useStaff } from '@/features/auth/use-staff';
import { ServicePicker, canRecordServices } from '@/features/quick-entry/service-picker';
import { Link } from '@/i18n/navigation';
import { ApiError, api, apiPatch } from '@/lib/api';
import { useDistance } from '@/lib/format';
import { ServiceHistory } from './service-history';
import { VehicleForm } from './vehicle-form';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/** One car: details, today's estimated odometer, its customer, and its history. */
export function VehiclePage({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('vehicles');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const distance = useDistance();
  const queryClient = useQueryClient();
  const { data: me } = useStaff();
  const [editing, setEditing] = useState(false);

  const vehicle = useQuery({
    queryKey: ['vehicle', vehicleId],
    queryFn: () => api<VehicleDetail>(`/v1/vehicles/${vehicleId}`),
    // Each load writes a vehicle.view audit row: no refetch on tab focus.
    refetchOnWindowFocus: false,
  });
  const save = useMutation({
    mutationFn: (values: UpdateVehicleInput) =>
      apiPatch<VehicleDetail>(`/v1/vehicles/${vehicleId}`, values),
    onSuccess: (updated) => {
      queryClient.setQueryData(['vehicle', vehicleId], updated);
      void queryClient.invalidateQueries({ queryKey: ['customer', updated.customer.id] });
      void queryClient.invalidateQueries({ queryKey: ['search'] });
      setEditing(false);
    },
  });

  if (vehicle.isPending) return <p className="text-sm text-muted">{tCommon('loading')}</p>;
  if (vehicle.error) {
    const missing = vehicle.error instanceof ApiError && vehicle.error.status === 404;
    return missing ? <Alert>{t('notFound')}</Alert> : <ApiErrorAlert error={vehicle.error} />;
  }
  const v = vehicle.data;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        {tCommon('backToSearch')}
      </Link>

      <Card>
        {editing ? (
          <VehicleForm
            mode="edit"
            defaultValues={{
              plate: v.plate,
              make: v.make,
              model: v.model,
              year: v.year,
              distanceUnit: v.distanceUnit,
              notes: v.notes ?? '',
            }}
            submitLabel={tCommon('save')}
            pending={save.isPending}
            error={save.error}
            onSubmit={(values) => save.mutate(values)}
            onCancel={() => {
              save.reset();
              setEditing(false);
            }}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-mono text-2xl font-extrabold" dir="ltr">
                  {v.plate}
                </h1>
                <p className="text-soft-ink">
                  {v.make} {v.model}
                  {v.year ? ` · ${v.year}` : ''}
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
                {tCommon('edit')}
              </Button>
            </div>
            <dl className="divide-y divide-line">
              <Row label={t('owner')}>
                <Link href={`/customers/${v.customer.id}`} className="underline">
                  {v.customer.name}
                </Link>{' '}
                <span className="text-muted" dir="ltr">
                  {v.customer.phone}
                </span>
              </Row>
              <Row label={t('estimated')}>{distance(v.estimatedKm, v.distanceUnit)}</Row>
              <Row label={t('lastOdometer')}>
                {distance(v.currentKm, v.distanceUnit)}
                {v.lastOdometerAt && (
                  <span className="text-muted">
                    {' · '}
                    {format.dateTime(new Date(v.lastOdometerAt), { dateStyle: 'medium' })}
                  </span>
                )}
              </Row>
              <Row label={t('perDay')}>
                {v.avgDailyKm === null
                  ? t('noAverage')
                  : distance(Math.round(v.avgDailyKm), v.distanceUnit)}
              </Row>
            </dl>
            {v.notes && <p className="whitespace-pre-line text-sm text-muted">{v.notes}</p>}
          </div>
        )}
      </Card>

      {canRecordServices(me?.role) && (
        <ServicePicker href={(type) => `/vehicles/${v.id}/service?type=${type.id}`} />
      )}

      <ServiceHistory vehicleId={v.id} unit={v.distanceUnit} />
    </div>
  );
}
