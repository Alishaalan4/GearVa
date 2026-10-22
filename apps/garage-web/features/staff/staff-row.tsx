'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type BranchItem,
  type StaffItem,
  type UpdateStaffInput,
  updateStaffSchema,
} from '@gearva/contracts';
import { Button, Field, Input } from '@gearva/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ApiErrorAlert } from '@/components/api-error';
import { apiPatch, apiPost } from '@/lib/api';
import { RoleAndBranchFields, branchIdValue } from './staff-fields';

export const STAFF_LIST_KEY = ['staff', 'list'] as const;

type Action =
  | { kind: 'update'; body: UpdateStaffInput; done: string }
  | { kind: 'invite' | 'password-reset'; done: string };

/** One staff member: details, and the owner's actions on them (flow.md 1, 2.1). */
export function StaffRow({
  member,
  branches,
  onNotice,
}: {
  member: StaffItem;
  branches: BranchItem[];
  onNotice: (notice: string | null) => void;
}) {
  const t = useTranslations('staff');
  const tRoles = useTranslations('roles');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const action = useMutation({
    mutationFn: (a: Action) =>
      a.kind === 'update'
        ? apiPatch<StaffItem>(`/v1/users/${member.id}`, a.body)
        : apiPost<StaffItem>(`/v1/users/${member.id}/${a.kind}`),
    onMutate: () => onNotice(null),
    onSuccess: (_, { done }) => {
      void queryClient.invalidateQueries({ queryKey: STAFF_LIST_KEY });
      setEditing(false);
      onNotice(done);
    },
  });

  const branch = branches.find((b) => b.id === member.branchId);
  const isOwner = member.role === 'OWNER';

  return (
    <li className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{member.name}</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{tRoles(member.role)}</span>
            {!member.isActive ? (
              <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">
                {t('inactive')}
              </span>
            ) : (
              !member.hasPassword && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  {t('invitePending')}
                </span>
              )
            )}
          </div>
          <p className="text-sm text-slate-600" dir="ltr">
            {member.email}
          </p>
          <p className="text-sm text-slate-600">
            {branch ? `${branch.name} (${branch.code})` : t('allBranches')}
            {' · '}
            {member.lastLoginAt
              ? t('lastLogin', {
                  date: format.dateTime(new Date(member.lastLoginAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                })
              : t('neverSignedIn')}
          </p>
          {isOwner && <p className="text-xs text-slate-500">{t('ownerNote')}</p>}
        </div>

        {!isOwner && !editing && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
              {t('edit')}
            </Button>
            {member.isActive && !member.hasPassword && (
              <Button
                type="button"
                variant="secondary"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({ kind: 'invite', done: t('inviteSent', { email: member.email }) })
                }
              >
                {t('resendInvite')}
              </Button>
            )}
            {member.isActive && member.hasPassword && (
              <Button
                type="button"
                variant="secondary"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({
                    kind: 'password-reset',
                    done: t('resetSent', { email: member.email }),
                  })
                }
              >
                {t('sendReset')}
              </Button>
            )}
            {member.isActive ? (
              <Button
                type="button"
                variant="danger"
                disabled={action.isPending}
                onClick={() => {
                  if (!window.confirm(t('confirmDeactivate', { name: member.name }))) return;
                  action.mutate({
                    kind: 'update',
                    body: { isActive: false },
                    done: t('deactivated', { name: member.name }),
                  });
                }}
              >
                {t('deactivate')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({
                    kind: 'update',
                    body: { isActive: true },
                    done: t('activated', { name: member.name }),
                  })
                }
              >
                {t('activate')}
              </Button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <EditStaffForm
          member={member}
          // Active branches, plus the current one so the select shows it even if inactive.
          branches={branches.filter((b) => b.isActive || b.id === member.branchId)}
          pending={action.isPending}
          onCancel={() => {
            action.reset();
            setEditing(false);
          }}
          onSubmit={(body) => action.mutate({ kind: 'update', body, done: t('saved') })}
          submitLabel={tCommon('save')}
          cancelLabel={tCommon('cancel')}
        />
      )}
      <ApiErrorAlert error={action.error} />
    </li>
  );
}

function EditStaffForm({
  member,
  branches,
  pending,
  onSubmit,
  onCancel,
  submitLabel,
  cancelLabel,
}: {
  member: StaffItem;
  branches: BranchItem[];
  pending: boolean;
  onSubmit: (body: UpdateStaffInput) => void;
  onCancel: () => void;
  submitLabel: string;
  cancelLabel: string;
}) {
  const t = useTranslations('staff');
  const form = useForm<z.input<typeof updateStaffSchema>, unknown, UpdateStaffInput>({
    resolver: zodResolver(updateStaffSchema),
    defaultValues: {
      name: member.name,
      role: member.role === 'OWNER' ? undefined : member.role,
      branchId: member.branchId,
    },
  });
  const { errors } = form.formState;

  return (
    <form
      className="space-y-4 border-t border-slate-100 pt-4"
      noValidate
      onSubmit={form.handleSubmit(({ name, role, branchId }) =>
        // The branch is sent only when it changed, so an unchanged inactive branch is kept.
        onSubmit(branchId === member.branchId ? { name, role } : { name, role, branchId }),
      )}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('name')} error={errors.name && t('invalid.name')}>
          <Input aria-invalid={!!errors.name} {...form.register('name')} />
        </Field>
        <RoleAndBranchFields
          branches={branches}
          role={form.register('role')}
          branch={form.register('branchId', { setValueAs: branchIdValue })}
          branchError={!!errors.branchId}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </form>
  );
}
