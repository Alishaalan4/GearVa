'use client';

import type { GarageAnnouncement } from '@gearva/contracts';
import { Button } from '@gearva/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, apiPost } from '@/lib/api';

const KEY = ['announcements'];

/**
 * flow.md 11.9 (step 5.10): messages from Gearva, at the top of every page until this
 * staff member closes them. An admin in "View as" sees them without a close button.
 */
export function AnnouncementBanners({ viewOnly }: { viewOnly: boolean }) {
  const t = useTranslations('announcements');
  const queryClient = useQueryClient();
  const messages = useQuery({
    queryKey: KEY,
    queryFn: () => api<GarageAnnouncement[]>('/v1/announcements'),
    staleTime: 5 * 60_000,
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => apiPost<void>(`/v1/announcements/${id}/dismiss`),
    onSuccess: (_, id) =>
      queryClient.setQueryData<GarageAnnouncement[]>(KEY, (list) =>
        list?.filter((m) => m.id !== id),
      ),
  });

  // A banner is extra: if it cannot load, the page works as usual.
  if (!messages.data?.length) return null;
  return (
    <div className="mb-4 space-y-2">
      {messages.data.map((m) => (
        <section
          key={m.id}
          role="status"
          aria-label={t('from')}
          className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-brand/30 bg-tint px-4 py-3 text-sm"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-medium text-brand-ink">{t('from')}</p>
            <p className="font-semibold">{m.title}</p>
            <p className="whitespace-pre-line break-words">{m.body}</p>
          </div>
          {!viewOnly && (
            <Button
              type="button"
              variant="secondary"
              disabled={dismiss.isPending}
              onClick={() => dismiss.mutate(m.id)}
            >
              {t('close')}
            </Button>
          )}
        </section>
      ))}
    </div>
  );
}
