'use client';

import type { Paginated, StaffItem } from '@gearva/contracts';
import { Alert, Button, Card } from '@gearva/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { useStaff } from '@/features/auth/use-staff';
import { useBranches } from '@/features/branches/use-branches';
import { api } from '@/lib/api';
import { InviteStaffForm } from './invite-staff-form';
import { STAFF_LIST_KEY, StaffRow } from './staff-row';

const PAGE_SIZE = 20;

/** flow.md 1: the OWNER invites staff, changes role or branch, and deactivates them. */
export function StaffSettings() {
  const t = useTranslations('staff');
  const tCommon = useTranslations('common');
  const me = useStaff();
  const branches = useBranches();
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);

  const staff = useQuery({
    queryKey: [...STAFF_LIST_KEY, page],
    queryFn: () => api<Paginated<StaffItem>>(`/v1/users?page=${page}&pageSize=${PAGE_SIZE}`),
    placeholderData: keepPreviousData,
  });

  if (!me.data || branches.isPending) {
    return <p className="text-sm text-slate-500">{tCommon('loading')}</p>;
  }
  if (branches.error) return <ApiErrorAlert error={branches.error} />;

  const allBranches = branches.data.items;
  const activeBranches = allBranches.filter((b) => b.isActive);
  const pages = staff.data ? Math.max(1, Math.ceil(staff.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      {notice && <Alert tone="success">{notice}</Alert>}

      <Card title={t('invite')}>
        <InviteStaffForm
          branches={activeBranches}
          defaultLocale={me.data.garage.defaultLocale}
          onInvited={(member) => {
            setNotice(t('invited', { email: member.email }));
            void staff.refetch();
          }}
        />
      </Card>

      <ApiErrorAlert error={staff.error} />
      {staff.isPending && <p className="text-sm text-slate-500">{tCommon('loading')}</p>}
      <ul className="space-y-3">
        {staff.data?.items.map((member) => (
          <StaffRow key={member.id} member={member} branches={allBranches} onNotice={setNotice} />
        ))}
      </ul>

      {staff.data && pages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>{t('total', { count: staff.data.total })}</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {tCommon('previous')}
            </Button>
            <span>{tCommon('pageOf', { page, pages })}</span>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              {tCommon('next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
