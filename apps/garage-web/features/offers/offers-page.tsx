'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  DISCOUNT_TYPES,
  OFFER_IMAGE_MAX_BYTES,
  type OfferItem,
  type OfferState,
  type Paginated,
} from '@gearva/contracts';
import { Alert, Button, Card, Field, Input, Pill, Select, Textarea } from '@gearva/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { ApiErrorAlert } from '@/components/api-error';
import { Pager } from '@/components/pager';
import { api, apiFile, apiPatch, apiPost, apiUpload } from '@/lib/api';
import { centsToDecimal, dollarsToCents, useMoney } from '@/lib/format';

const OFFERS_KEY = ['offers'];
/** Each offer's image, as a blob URL; refreshed after a new image is saved. */
const IMAGE_KEY = ['offer-image'];

const STATE_TONE: Record<OfferState, 'ok' | 'brand' | 'soft' | 'bad'> = {
  ACTIVE: 'ok',
  SCHEDULED: 'brand',
  ENDED: 'soft',
  OFF: 'soft',
};

/** YYYY-MM-DD of an ISO time, in this browser's time zone (for date inputs). */
function dayOf(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The form in the garage's terms (dollars, days); the API's schema checks the result.
const formSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    body: z.string().trim().max(1000),
    discountType: z.enum(DISCOUNT_TYPES),
    value: z.string().trim().min(1),
    startDay: z.string(),
    endDay: z.string(),
    isActive: z.boolean(),
  })
  .refine(
    (v) =>
      v.discountType === 'AMOUNT'
        ? (dollarsToCents(v.value) ?? 0) > 0
        : /^\d+$/.test(v.value) && Number(v.value) >= 1 && Number(v.value) <= 100,
    { path: ['value'] },
  )
  .refine((v) => !v.startDay || !v.endDay || v.endDay >= v.startDay, { path: ['endDay'] });
type FormValues = z.infer<typeof formSchema>;

function toPayload(v: FormValues) {
  return {
    title: v.title,
    body: v.body,
    discountType: v.discountType,
    discountValue: v.discountType === 'AMOUNT' ? (dollarsToCents(v.value) ?? 0) : Number(v.value),
    // A day starts at local midnight and ends just before the next one.
    ...(v.startDay ? { startsAt: new Date(`${v.startDay}T00:00:00`).toISOString() } : {}),
    expiresAt: v.endDay ? new Date(`${v.endDay}T23:59:59`).toISOString() : null,
    isActive: v.isActive,
  };
}

/**
 * Offers (flow.md 10, step 6.5), for OWNER and MANAGER: what the garage's customers see
 * in the Gearva app. Sending an offer to a group and using it on an invoice come later.
 */
export function OffersPage() {
  const t = useTranslations('offers');
  const tCommon = useTranslations('common');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<OfferItem | 'new' | null>(null);
  const offers = useQuery({
    queryKey: [...OFFERS_KEY, page],
    queryFn: () => api<Paginated<OfferItem>>(`/v1/offers?page=${page}`),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t('title')}</h1>
          <p className="text-sm text-muted">{t('lead')}</p>
        </div>
        {editing === null && <Button onClick={() => setEditing('new')}>{t('new')}</Button>}
      </div>

      {editing !== null && (
        <OfferForm offer={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
      )}

      {offers.isPending && <p className="text-sm text-muted">{tCommon('loading')}</p>}
      <ApiErrorAlert error={offers.error} />
      {offers.data && offers.data.total === 0 && <p className="text-sm text-muted">{t('empty')}</p>}
      <ul className="space-y-3">
        {offers.data?.items.map((o) => (
          <li key={o.id}>
            <OfferRow offer={o} onEdit={() => setEditing(o)} />
          </li>
        ))}
      </ul>
      {offers.data && (
        <Pager
          page={page}
          pageSize={offers.data.pageSize}
          total={offers.data.total}
          onPage={setPage}
        />
      )}
    </div>
  );
}

function OfferRow({ offer, onEdit }: { offer: OfferItem; onEdit: () => void }) {
  const t = useTranslations('offers');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const money = useMoney();
  const day = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' });
  return (
    <Card>
      {offer.hasImage && <OfferImage offerId={offer.id} className="mb-3 max-h-56 w-full" />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">{offer.title}</h2>
            <Pill tone={STATE_TONE[offer.state]}>{t(`state.${offer.state}`)}</Pill>
          </div>
          <p className="font-semibold text-brand-ink">
            {offer.discountType === 'PERCENT'
              ? t('percentOff', { value: offer.discountValue })
              : t('amountOff', { value: money(offer.discountValue) })}
          </p>
          {offer.body && <p className="whitespace-pre-line text-sm text-soft-ink">{offer.body}</p>}
          <p className="text-xs text-muted">
            {offer.expiresAt
              ? t('dates', { from: day(offer.startsAt), to: day(offer.expiresAt) })
              : t('from', { from: day(offer.startsAt) })}
            {' · '}
            {t('views', { count: offer.viewCount })}
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={onEdit}>
          {tCommon('edit')}
        </Button>
      </div>
    </Card>
  );
}

function OfferForm({ offer, onDone }: { offer: OfferItem | null; onDone: () => void }) {
  const t = useTranslations('offers');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const [imageProblem, setImageProblem] = useState<'imageTooBig' | 'imageType' | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: offer?.title ?? '',
      body: offer?.body ?? '',
      discountType: offer?.discountType ?? 'PERCENT',
      value: offer
        ? offer.discountType === 'AMOUNT'
          ? centsToDecimal(offer.discountValue)
          : String(offer.discountValue)
        : '',
      startDay: dayOf(offer?.startsAt ?? null),
      endDay: dayOf(offer?.expiresAt ?? null),
      isActive: offer?.isActive ?? true,
    },
  });
  const { errors } = form.formState;
  const type = useWatch({ control: form.control, name: 'discountType' });
  // The image picked in this form: shown at once, uploaded with Save.
  const [picked, setPicked] = useState<File | null>(null);
  const pickedUrl = useMemo(() => (picked ? URL.createObjectURL(picked) : null), [picked]);
  useEffect(
    () => () => {
      if (pickedUrl) URL.revokeObjectURL(pickedUrl);
    },
    [pickedUrl],
  );

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const saved = offer
        ? await apiPatch<OfferItem>(`/v1/offers/${offer.id}`, toPayload(values))
        : await apiPost<OfferItem>('/v1/offers', toPayload(values));
      if (picked) {
        const body = new FormData();
        body.append('file', picked);
        await apiUpload<OfferItem>(`/v1/offers/${saved.id}/image`, body);
      }
      return saved;
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: OFFERS_KEY });
      void queryClient.invalidateQueries({ queryKey: [...IMAGE_KEY, saved.id] });
      onDone();
    },
  });

  return (
    <Card title={offer ? t('editTitle') : t('newTitle')}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
      >
        <Field label={t('fields.title')} error={errors.title && t('invalid.title')}>
          <Input aria-invalid={!!errors.title} {...form.register('title')} />
        </Field>
        <Field label={t('fields.body')} error={errors.body && t('invalid.body')}>
          <Textarea rows={3} {...form.register('body')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('fields.type')}>
            <Select {...form.register('discountType')}>
              <option value="PERCENT">{t('types.PERCENT')}</option>
              <option value="AMOUNT">{t('types.AMOUNT')}</option>
            </Select>
          </Field>
          <Field
            label={type === 'PERCENT' ? t('fields.percent') : t('fields.amount')}
            error={
              errors.value && (type === 'PERCENT' ? t('invalid.percent') : t('invalid.amount'))
            }
          >
            <Input
              inputMode="decimal"
              dir="ltr"
              aria-invalid={!!errors.value}
              {...form.register('value')}
            />
          </Field>
          <Field label={t('fields.start')} hint={t('startHint')}>
            <Input type="date" dir="ltr" {...form.register('startDay')} />
          </Field>
          <Field
            label={t('fields.end')}
            hint={t('endHint')}
            error={errors.endDay && t('invalid.end')}
          >
            <Input
              type="date"
              dir="ltr"
              aria-invalid={!!errors.endDay}
              {...form.register('endDay')}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...form.register('isActive')} />
          {t('fields.active')}
        </label>

        <div className="space-y-3 rounded-xl border border-line p-3">
          <p className="text-sm font-semibold">{t('image')}</p>
          {pickedUrl ? (
            // A local file the user just picked: next/image cannot optimise it.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pickedUrl}
              alt={t('image')}
              className="max-h-56 w-full rounded-[10px] border border-line bg-white object-contain"
            />
          ) : offer?.hasImage ? (
            <OfferImage offerId={offer.id} className="max-h-56 w-full" />
          ) : (
            <p className="text-xs text-muted">{t('imageNone')}</p>
          )}
          {pickedUrl && <p className="text-xs text-muted">{t('imageOnSave')}</p>}
          <div className="flex flex-wrap items-center gap-4">
            <label className="cursor-pointer text-sm font-semibold underline">
              {pickedUrl || offer?.hasImage ? t('replaceImage') : t('uploadImage')}
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                disabled={save.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  const found =
                    file.size > OFFER_IMAGE_MAX_BYTES
                      ? 'imageTooBig'
                      : ['image/png', 'image/jpeg'].includes(file.type)
                        ? null
                        : 'imageType';
                  setImageProblem(found);
                  if (!found) setPicked(file);
                }}
              />
            </label>
            {picked && (
              <button
                type="button"
                className="text-sm text-muted underline"
                onClick={() => setPicked(null)}
              >
                {t('undoImage')}
              </button>
            )}
          </div>
          {imageProblem && <Alert>{t(imageProblem)}</Alert>}
        </div>

        <ApiErrorAlert error={save.error} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={save.isPending}>
            {tCommon('save')}
          </Button>
          <Button type="button" variant="secondary" onClick={onDone}>
            {tCommon('cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** The offer's stored image, loaded with the staff session (the API checks role and garage). */
function OfferImage({ offerId, className = '' }: { offerId: string; className?: string }) {
  const t = useTranslations('offers');
  const image = useQuery({
    queryKey: [...IMAGE_KEY, offerId],
    queryFn: async () => URL.createObjectURL(await apiFile(`/v1/offers/${offerId}/image`)),
    staleTime: Infinity,
  });
  const url = image.data;
  // Frees the previous image once a new one replaces it.
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  if (!url) return <div className={`h-32 animate-pulse rounded-[10px] bg-soft ${className}`} />;
  return (
    // A blob from our own API: next/image cannot optimise it.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={t('image')}
      className={`rounded-[10px] border border-line bg-white object-contain ${className}`}
    />
  );
}
