'use client';

import type { VehicleDetail, VisitDetail } from '@gearva/contracts';
import { Alert } from '@gearva/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ApiErrorAlert } from '@/components/api-error';
import { useStaff } from '@/features/auth/use-staff';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { ServiceForm } from './service-form';
import { canRecordServices } from './service-picker';

function useVehicle(vehicleId: string | undefined) {
  return useQuery({
    queryKey: ['vehicle', vehicleId],
    queryFn: () => api<VehicleDetail>(`/v1/vehicles/${vehicleId}`),
    enabled: !!vehicleId,
    refetchOnWindowFocus: false,
  });
}

/** flow.md 4.1: quick entry for one car and one service (a new visit). */
export function QuickEntryPage({
  vehicleId,
  serviceTypeId,
}: {
  vehicleId: string;
  serviceTypeId: string | undefined;
}) {
  const t = useTranslations('quick');
  const tCommon = useTranslations('common');
  const { data: me } = useStaff();
  const vehicle = useVehicle(vehicleId);

  if (me && !canRecordServices(me.role)) return <Alert>{t('notAllowed')}</Alert>;
  if (!serviceTypeId) return <Alert>{t('noService')}</Alert>;
  if (vehicle.isPending) return <p className="text-sm text-slate-500">{tCommon('loading')}</p>;
  if (vehicle.error) return <ApiErrorAlert error={vehicle.error} />;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/vehicles/${vehicleId}`} className="text-sm text-slate-600 hover:text-slate-900">
        {t('backToCar', { plate: vehicle.data.plate })}
      </Link>
      <ServiceForm vehicle={vehicle.data} serviceTypeId={serviceTypeId} />
    </div>
  );
}

/** "Add another": one more service on an open visit, at the visit's odometer. */
export function AddServicePage({
  visitId,
  serviceTypeId,
}: {
  visitId: string;
  serviceTypeId: string | undefined;
}) {
  const t = useTranslations('quick');
  const tCommon = useTranslations('common');
  const visit = useQuery({
    queryKey: ['visit', visitId],
    queryFn: () => api<VisitDetail>(`/v1/visits/${visitId}`),
  });
  const vehicle = useVehicle(visit.data?.vehicle.id);

  if (!serviceTypeId) return <Alert>{t('noService')}</Alert>;
  if (visit.error ?? vehicle.error) return <ApiErrorAlert error={visit.error ?? vehicle.error} />;
  if (!visit.data || !vehicle.data) {
    return <p className="text-sm text-slate-500">{tCommon('loading')}</p>;
  }
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/visits/${visitId}`} className="text-sm text-slate-600 hover:text-slate-900">
        {t('backToVisit')}
      </Link>
      <ServiceForm vehicle={vehicle.data} serviceTypeId={serviceTypeId} visit={visit.data} />
    </div>
  );
}
