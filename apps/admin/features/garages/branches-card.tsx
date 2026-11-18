'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type AdminBranchItem,
  type CreateBranchInput,
  type UpdateBranchInput,
  createBranchSchema,
} from '@gearva/contracts';
import { Alert, Button, Card, Field, Input } from '@gearva/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ApiErrorAlert } from '@/components/api-error';
import { useAdmin } from '@/features/auth/use-admin';
import { api, apiPatch, apiPost } from '@/lib/api';

type FormInput = z.input<typeof createBranchSchema>;

/**
 * flow.md 11.7 (decision 2026-11-16): Gearva adds a garage's branches and switches them
 * on or off, because extra branches are billed. The garage owner only edits the name,
 * address and phone. A branch with active staff, and the main branch, stay on (the API
 * says why). Only super admins change branches here (step 5.10); other admins look.
 */
export function BranchesCard({ garageId }: { garageId: string }) {
  const t = useTranslations('branchAdmin');
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const canChange = useAdmin().data?.role === 'SUPER_ADMIN';
  const key = ['garage', garageId, 'branches'];
  const branches = useQuery({
    queryKey: key,
    queryFn: () => api<AdminBranchItem[]>(`/admin/v1/garages/${garageId}/branches`),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ['garage', garageId] });
    void queryClient.invalidateQueries({ queryKey: ['garages'] });
  };

  const create = useMutation({
    mutationFn: (values: CreateBranchInput) =>
      apiPost<AdminBranchItem>(`/admin/v1/garages/${garageId}/branches`, values),
    onMutate: () => setNotice(null),
    onSuccess: (branch) => {
      refresh();
      setAdding(false);
      setNotice(t('created', { name: branch.name, code: branch.code }));
    },
  });

  return (
    <Card title={t('title')}>
      <div className="space-y-3">
        <p className="text-xs text-muted">{t('hint')}</p>
        {notice && <Alert tone="success">{notice}</Alert>}
        <ApiErrorAlert error={branches.error} />
        <ul className="divide-y divide-line text-sm">
          {branches.data?.map((b) => (
            <BranchRow
              key={b.id}
              garageId={garageId}
              branch={b}
              canChange={canChange}
              onChanged={refresh}
              onNotice={setNotice}
            />
          ))}
        </ul>
        {!canChange ? (
          <p className="text-xs text-muted">{t('superOnly')}</p>
        ) : adding ? (
          <BranchFields
            submitLabel={t('add')}
            pending={create.isPending}
            error={create.error}
            onSubmit={(values) => create.mutate(values)}
            onCancel={() => {
              create.reset();
              setAdding(false);
            }}
          />
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            {t('addBranch')}
          </Button>
        )}
      </div>
    </Card>
  );
}

function BranchRow({
  garageId,
  branch,
  canChange,
  onChanged,
  onNotice,
}: {
  garageId: string;
  branch: AdminBranchItem;
  canChange: boolean;
  onChanged: () => void;
  onNotice: (notice: string | null) => void;
}) {
  const t = useTranslations('branchAdmin');
  const [editing, setEditing] = useState(false);
  const update = useMutation({
    mutationFn: ({ body }: { body: UpdateBranchInput; done: string }) =>
      apiPatch<AdminBranchItem>(`/admin/v1/garages/${garageId}/branches/${branch.id}`, body),
    onMutate: () => onNotice(null),
    onSuccess: (_, { done }) => {
      onChanged();
      setEditing(false);
      onNotice(done);
    },
  });

  if (editing) {
    return (
      <li className="py-3">
        <BranchFields
          defaultValues={{
            name: branch.name,
            address: branch.address ?? '',
            phone: branch.phone ?? '',
          }}
          submitLabel={t('save')}
          pending={update.isPending}
          error={update.error}
          onSubmit={(body) => update.mutate({ body, done: t('saved') })}
          onCancel={() => {
            update.reset();
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p>
            <span className="font-medium">{branch.name}</span>{' '}
            <span className="text-xs text-muted" dir="ltr">
              {branch.code}
            </span>
          </p>
          <p className="text-xs text-muted">
            {[
              branch.isMain ? t('main') : null,
              branch.isActive ? null : t('inactive'),
              t('staff', { count: branch.activeStaff }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {(branch.address || branch.phone) && (
            <p className="text-xs text-muted">
              {branch.address}
              {branch.address && branch.phone ? ' · ' : ''}
              {branch.phone && <span dir="ltr">{branch.phone}</span>}
            </p>
          )}
        </div>
        {canChange && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t('edit')}
            </Button>
            {!branch.isMain && (
              <Button
                variant={branch.isActive ? 'danger' : 'secondary'}
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
        )}
      </div>
      <ApiErrorAlert error={update.error} />
    </li>
  );
}

/** Name, address and phone, validated with the API's schema. */
function BranchFields({
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
  onSubmit: (values: CreateBranchInput) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('branchAdmin');
  const tCommon = useTranslations('common');
  const form = useForm<FormInput, unknown, CreateBranchInput>({
    resolver: zodResolver(createBranchSchema),
    defaultValues,
  });
  const { errors } = form.formState;
  return (
    <form className="space-y-3" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-3 sm:grid-cols-3">
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
        <Button type="button" variant="secondary" onClick={onCancel}>
          {tCommon('cancel')}
        </Button>
      </div>
    </form>
  );
}
