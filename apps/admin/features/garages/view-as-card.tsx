'use client';

import type { ViewAsLink } from '@gearva/contracts';
import { Button, Card, buttonClass } from '@gearva/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ApiErrorAlert } from '@/components/api-error';
import { apiPost } from '@/lib/api';
import { useDates } from '@/lib/format';

/**
 * flow.md 11.3: opens the garage's own app, read only, in a new tab. The link works once,
 * for 2 minutes, so it is fetched on demand and shown to click (a tab opened after a
 * request would be blocked as a pop-up).
 */
export function ViewAsCard({ garageId, garageName }: { garageId: string; garageName: string }) {
  const t = useTranslations('viewAs');
  const { dateTime } = useDates();
  const link = useMutation({
    mutationFn: () => apiPost<ViewAsLink>(`/admin/v1/garages/${garageId}/view-as`),
  });

  return (
    <Card title={t('title')}>
      <div className="space-y-3">
        <p className="text-sm text-muted">{t('hint')}</p>
        <ApiErrorAlert error={link.error} />
        {link.data ? (
          <div className="space-y-2">
            <a
              href={link.data.url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass()}
              onClick={() => setTimeout(() => link.reset(), 0)}
            >
              {t('open', { name: garageName })}
            </a>
            <p className="text-xs text-muted">
              {t('expires', { time: dateTime(link.data.expiresAt) })}
            </p>
          </div>
        ) : (
          <Button variant="secondary" disabled={link.isPending} onClick={() => link.mutate()}>
            {t('getLink')}
          </Button>
        )}
      </div>
    </Card>
  );
}
