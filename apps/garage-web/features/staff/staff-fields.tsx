'use client';

import { type BranchItem, INVITABLE_ROLES } from '@gearva/contracts';
import { Field, Select } from '@gearva/ui';
import { useTranslations } from 'next-intl';
import type { UseFormRegisterReturn } from 'react-hook-form';

/** Empty choice = null ("all branches"), as the API expects. */
export const branchIdValue = (v: string) => (v === '' ? null : v);

/** Role and branch pickers, shared by the invite and edit forms. */
export function RoleAndBranchFields({
  branches,
  role,
  branch,
  branchError,
}: {
  /** Active branches, plus a member's current branch even if it was deactivated. */
  branches: BranchItem[];
  role: UseFormRegisterReturn;
  branch: UseFormRegisterReturn;
  branchError: boolean;
}) {
  const t = useTranslations('staff');
  const tRoles = useTranslations('roles');
  return (
    <>
      <Field label={t('role')}>
        <Select {...role}>
          {INVITABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {tRoles(r)}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={t('branch')}
        hint={t('branchHint')}
        error={branchError ? t('invalid.branchId') : undefined}
      >
        <Select aria-invalid={branchError} {...branch}>
          <option value="">{t('allBranches')}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.code})
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}
