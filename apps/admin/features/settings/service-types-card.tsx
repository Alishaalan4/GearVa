'use client';

import {
  type GlobalServiceTypeItem,
  createGlobalServiceTypeSchema,
  updateGlobalServiceTypeSchema,
} from '@gearva/contracts';
import { Alert, Button, Card, Field, Input, Pill } from '@gearva/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiErrorAlert } from '@/components/api-error';
import { Table, Td } from '@/components/table';
import { api, apiPatch, apiPost } from '@/lib/api';

const KEY = ['service-types'] as const;

interface Values {
  code: string;
  nameEn: string;
  nameAr: string;
  defaultIntervalKm: string;
  defaultIntervalMi: string;
  defaultIntervalMonths: string;
  sortOrder: string;
  isActive: boolean;
}

const EMPTY: Values = {
  code: '',
  nameEn: '',
  nameAr: '',
  defaultIntervalKm: '',
  defaultIntervalMi: '',
  defaultIntervalMonths: '',
  sortOrder: '0',
  isActive: true,
};

const text = (n: number | null) => (n === null ? '' : String(n));
/** Empty means "no interval" (null); anything else must be a whole number. */
const whole = (s: string) => (s.trim() === '' ? null : /^\d+$/.test(s.trim()) ? Number(s) : -1);

/**
 * flow.md 11.4: the default service types every garage starts from. A garage's own
 * override is kept; hiding a type stops offering it to garages.
 */
export function ServiceTypesCard({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('serviceTypes');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<GlobalServiceTypeItem | 'new' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const types = useQuery({
    queryKey: KEY,
    queryFn: () => api<GlobalServiceTypeItem[]>('/admin/v1/service-types'),
  });

  const form = useForm<Values>({ defaultValues: EMPTY });
  const save = useMutation({
    mutationFn: ({ id, body }: { id: string | null; body: unknown }) =>
      id
        ? apiPatch<GlobalServiceTypeItem>(`/admin/v1/service-types/${id}`, body)
        : apiPost<GlobalServiceTypeItem>('/admin/v1/service-types', body),
    onSuccess: (item) => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      setEditing(null);
      setNotice(t('saved', { name: item.nameEn }));
    },
  });

  const open = (item: GlobalServiceTypeItem | 'new') => {
    setNotice(null);
    save.reset();
    setEditing(item);
    form.reset(
      item === 'new'
        ? EMPTY
        : {
            code: item.code,
            nameEn: item.nameEn,
            nameAr: item.nameAr,
            defaultIntervalKm: text(item.defaultIntervalKm),
            defaultIntervalMi: text(item.defaultIntervalMi),
            defaultIntervalMonths: text(item.defaultIntervalMonths),
            sortOrder: String(item.sortOrder),
            isActive: item.isActive,
          },
    );
  };

  const submit = form.handleSubmit((v) => {
    const fields = {
      nameEn: v.nameEn,
      nameAr: v.nameAr,
      defaultIntervalKm: whole(v.defaultIntervalKm),
      defaultIntervalMi: whole(v.defaultIntervalMi),
      defaultIntervalMonths: whole(v.defaultIntervalMonths),
      sortOrder: whole(v.sortOrder) ?? 0,
      isActive: v.isActive,
    };
    const isNew = editing === 'new';
    const parsed = isNew
      ? createGlobalServiceTypeSchema.safeParse({ ...fields, code: v.code })
      : updateGlobalServiceTypeSchema.safeParse(fields);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        form.setError(issue.path[0] as keyof Values, { type: 'invalid' });
      }
      return;
    }
    save.mutate({ id: isNew || !editing ? null : editing.id, body: parsed.data });
  });

  const { errors } = form.formState;
  const interval = (item: GlobalServiceTypeItem) =>
    [
      item.defaultIntervalKm !== null && `${format.number(item.defaultIntervalKm)} km`,
      item.defaultIntervalMi !== null && `${format.number(item.defaultIntervalMi)} mi`,
      item.defaultIntervalMonths !== null && t('months', { count: item.defaultIntervalMonths }),
    ]
      .filter(Boolean)
      .join(' · ') || tCommon('none');

  return (
    <Card title={t('title')}>
      <div className="space-y-4">
        <p className="text-sm text-muted">{t('hint')}</p>
        {notice && <Alert tone="success">{notice}</Alert>}
        <ApiErrorAlert error={types.error} />
        <Table
          head={[
            t('columns.name'),
            t('columns.interval'),
            t('columns.order'),
            t('columns.garages'),
            '',
          ]}
          loading={types.isPending && tCommon('loading')}
        >
          {types.data?.map((item) => (
            <tr key={item.id}>
              <Td>
                <span className="font-bold">{item.nameEn}</span> · {item.nameAr}
                <div className="flex items-center gap-2 text-xs text-muted" dir="ltr">
                  {item.code}
                  {!item.isActive && <Pill>{t('hidden')}</Pill>}
                </div>
              </Td>
              <Td className="whitespace-nowrap">{interval(item)}</Td>
              <Td>{item.sortOrder}</Td>
              <Td>{t('overrides', { count: item.overrideCount })}</Td>
              <Td>
                {canEdit && (
                  <Button type="button" variant="secondary" onClick={() => open(item)}>
                    {t('edit')}
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </Table>

        {canEdit && !editing && (
          <Button type="button" variant="secondary" onClick={() => open('new')}>
            {t('add')}
          </Button>
        )}

        {canEdit && editing && (
          <form className="space-y-3 border-t border-line pt-4" noValidate onSubmit={submit}>
            <h3 className="font-bold">
              {editing === 'new' ? t('addTitle') : t('editTitle', { name: editing.nameEn })}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field
                label={t('fields.code')}
                hint={t('codeHint')}
                error={errors.code && t('invalid')}
              >
                <Input dir="ltr" disabled={editing !== 'new'} {...form.register('code')} />
              </Field>
              <Field label={t('fields.nameEn')} error={errors.nameEn && t('invalid')}>
                <Input dir="ltr" {...form.register('nameEn')} />
              </Field>
              <Field label={t('fields.nameAr')} error={errors.nameAr && t('invalid')}>
                <Input dir="rtl" {...form.register('nameAr')} />
              </Field>
              <Field label={t('fields.sortOrder')} error={errors.sortOrder && t('invalid')}>
                <Input inputMode="numeric" dir="ltr" {...form.register('sortOrder')} />
              </Field>
              <Field label={t('fields.km')} error={errors.defaultIntervalKm && t('invalid')}>
                <Input inputMode="numeric" dir="ltr" {...form.register('defaultIntervalKm')} />
              </Field>
              <Field label={t('fields.mi')} error={errors.defaultIntervalMi && t('invalid')}>
                <Input inputMode="numeric" dir="ltr" {...form.register('defaultIntervalMi')} />
              </Field>
              <Field
                label={t('fields.months')}
                error={errors.defaultIntervalMonths && t('invalid')}
              >
                <Input inputMode="numeric" dir="ltr" {...form.register('defaultIntervalMonths')} />
              </Field>
              <label className="flex items-center gap-2 self-end pb-3 text-sm">
                <input type="checkbox" {...form.register('isActive')} />
                {t('fields.isActive')}
              </label>
            </div>
            <ApiErrorAlert error={save.error} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={save.isPending}>
                {t('save')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                {t('cancel')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
