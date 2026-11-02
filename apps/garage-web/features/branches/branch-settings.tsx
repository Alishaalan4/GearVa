'use client';

import type { BranchItem, CreateBranchInput, UpdateBranchInput } from '@gearva/contracts';
import { Alert, Button, Card } from '@gearva/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { apiPatch, apiPost } from '@/lib/api';
import { BranchForm } from './branch-form';
import { BRANCHES_QUERY_KEY, useBranches } from './use-branches';

/**
 * flow.md 1: the OWNER adds and edits branches. Codes (BR2, BR3...) are given by the API
 * and never change, because invoice numbers use them. The main branch stays active.
 */
export function BranchSettings() {
  const t = useTranslations('branches');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const branches = useBranches();
  const [notice, setNotice] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (values: CreateBranchInput) => apiPost<BranchItem>('/v1/branches', values),
    onMutate: () => setNotice(null),
    onSuccess: (branch) => {
      void queryClient.invalidateQueries({ queryKey: BRANCHES_QUERY_KEY });
      setNotice(t('created', { name: branch.name, code: branch.code }));
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      {notice && <Alert tone="success">{notice}</Alert>}

      <Card title={t('add')}>
        <BranchForm
          submitLabel={t('addSubmit')}
          pending={create.isPending}
          error={create.error}
          onSubmit={(values) =>
            create.mutateAsync(values).then(
              () => true,
              () => false,
            )
          }
        />
      </Card>

      <ApiErrorAlert error={branches.error} />
      {branches.isPending && <p className="text-sm text-muted">{tCommon('loading')}</p>}
      <ul className="space-y-3">
        {branches.data?.items.map((branch) => (
          <BranchRow key={branch.id} branch={branch} onNotice={setNotice} />
        ))}
      </ul>
    </div>
  );
}

function BranchRow({
  branch,
  onNotice,
}: {
  branch: BranchItem;
  onNotice: (notice: string | null) => void;
}) {
  const t = useTranslations('branches');
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const update = useMutation({
    mutationFn: ({ body }: { body: UpdateBranchInput; done: string }) =>
      apiPatch<BranchItem>(`/v1/branches/${branch.id}`, body),
    onMutate: () => onNotice(null),
    onSuccess: (_, { done }) => {
      void queryClient.invalidateQueries({ queryKey: BRANCHES_QUERY_KEY });
      setEditing(false);
      onNotice(done);
    },
  });

  return (
    <li className="rounded-xl border border-line bg-card p-4">
      {editing ? (
        <BranchForm
          defaultValues={{
            name: branch.name,
            address: branch.address ?? '',
            phone: branch.phone ?? '',
          }}
          submitLabel={t('save')}
          pending={update.isPending}
          error={update.error}
          onSubmit={(body) =>
            update.mutateAsync({ body, done: t('saved') }).then(
              () => true,
              () => false,
            )
          }
          onCancel={() => {
            update.reset();
            setEditing(false);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{branch.name}</span>
              <span className="text-xs text-muted" dir="ltr">
                {branch.code}
              </span>
              {branch.isMain && (
                <span className="rounded bg-soft px-2 py-0.5 text-xs">{t('main')}</span>
              )}
              {!branch.isActive && (
                <span className="rounded bg-tint px-2 py-0.5 text-xs text-brand-ink">
                  {t('inactive')}
                </span>
              )}
            </div>
            {branch.address && <p className="text-sm text-muted">{branch.address}</p>}
            {branch.phone && (
              <p className="text-sm text-muted" dir="ltr">
                {branch.phone}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
              {t('edit')}
            </Button>
            {!branch.isMain && (
              <Button
                type="button"
                variant="secondary"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate({
                    body: { isActive: !branch.isActive },
                    done: branch.isActive ? t('deactivated') : t('activated'),
                  })
                }
              >
                {branch.isActive ? t('deactivate') : t('activate')}
              </Button>
            )}
          </div>
          {update.error && (
            <div className="w-full">
              <ApiErrorAlert error={update.error} />
            </div>
          )}
        </div>
      )}
    </li>
  );
}
