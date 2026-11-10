'use client';

import { Alert } from '@gearva/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ApiErrorAlert } from '@/components/api-error';
import { Link } from '@/i18n/navigation';
import { GarageForm } from '../garages/garage-form';
import { useApplication } from './application-detail';

/**
 * flow.md 11.6 item 2: the create-garage form filled in from the application (trial by
 * default). Creating the garage marks the application approved; the owner gets the invite.
 */
export function ApproveApplication({ id }: { id: string }) {
  const t = useTranslations('applications');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const application = useApplication(id);

  if (application.isPending) return <p className="text-sm text-muted">{tCommon('loading')}</p>;
  if (application.error) return <ApiErrorAlert error={application.error} />;
  const a = application.data;
  if (a.status !== 'NEW') return <Alert>{t('alreadyReviewed')}</Alert>;

  return (
    <GarageForm
      title={t('approveTitle', { name: a.garageName })}
      submitPath={`/admin/v1/applications/${a.id}/approve`}
      initial={{
        name: a.garageName,
        email: a.email,
        phone: a.phone,
        locationText: a.city,
        ownerName: a.ownerName,
        defaultLocale: 'ar',
        plan: 'TRIAL',
      }}
      before={
        <p className="text-sm text-muted">
          {t('approveIntro', { branches: a.branchCount })}{' '}
          <Link href={`/applications/${a.id}`} className="underline">
            {t('backToApplication')}
          </Link>
        </p>
      }
      onCreated={() => {
        void queryClient.invalidateQueries({ queryKey: ['applications'] });
        void queryClient.invalidateQueries({ queryKey: ['application', a.id] });
      }}
    />
  );
}
