'use client';

import type { ServiceTypeItem, StaffRole } from '@gearva/contracts';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { ApiErrorAlert } from '@/components/api-error';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';

/** flow.md 1: who may create visits and records (the receptionist may not). */
export const canRecordServices = (role: StaffRole | undefined) =>
  role === 'OWNER' || role === 'MANAGER' || role === 'MECHANIC';

/** The garage's service types (overrides replace defaults); they rarely change. */
export function useServiceTypes() {
  return useQuery({
    queryKey: ['service-types'],
    queryFn: () => api<ServiceTypeItem[]>('/v1/service-types'),
    staleTime: 10 * 60_000,
  });
}

/** The service name in the page language. */
export function useServiceName() {
  const locale = useLocale();
  return (type: Pick<ServiceTypeItem, 'nameAr' | 'nameEn'>) =>
    locale === 'ar' ? type.nameAr : type.nameEn;
}

/**
 * flow.md 4.1 step 2: one big button per service type, so the mechanic taps instead of
 * typing. `href` builds the link for the chosen type.
 */
export function ServicePicker({ href }: { href: (type: ServiceTypeItem) => string }) {
  const t = useTranslations('quick');
  const types = useServiceTypes();
  const name = useServiceName();

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{t('pickService')}</h2>
      <ApiErrorAlert error={types.error} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {types.data?.map((type) => (
          <Link
            key={type.id}
            href={href(type)}
            className="flex min-h-14 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-3 text-center font-medium shadow-sm hover:border-slate-900 hover:bg-slate-50"
          >
            {name(type)}
          </Link>
        ))}
      </div>
    </section>
  );
}
