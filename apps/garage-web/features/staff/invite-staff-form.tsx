'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type BranchItem,
  type InviteStaffInput,
  LOCALES,
  type Locale,
  type StaffItem,
  inviteStaffSchema,
} from '@gearva/contracts';
import { Button, Field, Input, Select } from '@gearva/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ApiErrorAlert } from '@/components/api-error';
import { apiPost } from '@/lib/api';
import { RoleAndBranchFields, branchIdValue } from './staff-fields';

/** flow.md 2.1 step 3 for staff: the owner invites someone; they get an email link. */
export function InviteStaffForm({
  branches,
  defaultLocale,
  onInvited,
}: {
  branches: BranchItem[];
  defaultLocale: Locale;
  onInvited: (member: StaffItem) => void;
}) {
  const t = useTranslations('staff');
  const tLocales = useTranslations('locales');
  const form = useForm<z.input<typeof inviteStaffSchema>, unknown, InviteStaffInput>({
    resolver: zodResolver(inviteStaffSchema),
    defaultValues: { name: '', email: '', role: 'MECHANIC', branchId: null, locale: defaultLocale },
  });
  const { errors } = form.formState;

  const invite = useMutation({
    mutationFn: (values: InviteStaffInput) => apiPost<StaffItem>('/v1/users', values),
    onSuccess: (member) => {
      form.reset();
      onInvited(member);
    },
  });

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={form.handleSubmit((values) => invite.mutate(values))}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('name')} error={errors.name && t('invalid.name')}>
          <Input aria-invalid={!!errors.name} {...form.register('name')} />
        </Field>
        <Field label={t('email')} error={errors.email && t('invalid.email')}>
          <Input type="email" dir="ltr" aria-invalid={!!errors.email} {...form.register('email')} />
        </Field>
        <RoleAndBranchFields
          branches={branches}
          role={form.register('role')}
          branch={form.register('branchId', { setValueAs: branchIdValue })}
          branchError={!!errors.branchId}
        />
        <Field label={t('language')} hint={t('languageHint')}>
          <Select {...form.register('locale')}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {tLocales(l)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <ApiErrorAlert error={invite.error} />
      <Button type="submit" disabled={invite.isPending}>
        {t('inviteSubmit')}
      </Button>
    </form>
  );
}
