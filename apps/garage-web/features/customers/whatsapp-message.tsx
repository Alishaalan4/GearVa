'use client';

import type {
  StaffRole,
  WhatsappMessages,
  WhatsappSentResponse,
  WhatsappTemplate,
} from '@gearva/contracts';
import { Alert, Button, Card, Textarea, buttonClass } from '@gearva/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { useStaff } from '@/features/auth/use-staff';
import { api, apiPost } from '@/lib/api';

/** Who may message customers (flow.md 9.7, as the reminder list); the API checks too. */
const MESSAGE_ROLES: readonly StaffRole[] = ['OWNER', 'MANAGER', 'RECEPTIONIST'];

/**
 * Step 7.10 (flow.md 9.7): "Message on WhatsApp". Pick a ready message (written in the
 * customer's language), change it if needed, and open WhatsApp on the customer's number
 * with the text in place; staff press send there, from the garage's own phone.
 */
export function WhatsappMessage({ customerId, visitId }: { customerId: string; visitId?: string }) {
  const t = useTranslations('whatsapp');
  const staff = useStaff();
  const [open, setOpen] = useState(false);
  if (!staff.data || !MESSAGE_ROLES.includes(staff.data.role)) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t('title')}</h2>
          <p className="text-sm text-muted">{t('intro')}</p>
        </div>
        {!open && (
          <Button type="button" onClick={() => setOpen(true)}>
            {t('start')}
          </Button>
        )}
      </div>
      {open && (
        <Composer customerId={customerId} visitId={visitId} onClose={() => setOpen(false)} />
      )}
    </Card>
  );
}

function Composer({
  customerId,
  visitId,
  onClose,
}: {
  customerId: string;
  visitId?: string;
  onClose: () => void;
}) {
  const t = useTranslations('whatsapp');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const [template, setTemplate] = useState<WhatsappTemplate | null>(null);
  const [text, setText] = useState('');

  const messages = useQuery({
    queryKey: ['whatsapp', customerId, visitId ?? null],
    queryFn: () =>
      api<WhatsappMessages>(
        `/v1/customers/${customerId}/whatsapp${visitId ? `?visitId=${visitId}` : ''}`,
      ),
    refetchOnWindowFocus: false,
  });
  const logSent = useMutation({
    mutationFn: (chosen: WhatsappTemplate) =>
      apiPost<WhatsappSentResponse>(`/v1/customers/${customerId}/whatsapp-sent`, {
        template: chosen,
        ...(visitId ? { visitId } : {}),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  if (messages.isPending) return <p className="mt-3 text-sm text-muted">{tCommon('loading')}</p>;
  if (messages.error) {
    return (
      <div className="mt-3">
        <ApiErrorAlert error={messages.error} />
      </div>
    );
  }
  const m = messages.data;
  const choose = (next: WhatsappTemplate) => {
    setTemplate(next);
    setText(m.messages.find((x) => x.template === next)?.text ?? '');
    logSent.reset();
  };
  const url = `https://wa.me/${m.phone}?text=${encodeURIComponent(text.trim())}`;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap gap-2">
        {m.messages.map((x) => (
          <button
            key={x.template}
            type="button"
            aria-pressed={template === x.template}
            onClick={() => choose(x.template)}
            className={`h-9 rounded-full border px-3 text-sm font-semibold ${
              template === x.template
                ? 'border-brand bg-brand text-on-brand'
                : 'border-line bg-card hover:border-ink'
            }`}
          >
            {t(`templates.${x.template}`)}
          </button>
        ))}
      </div>

      {template && (
        <>
          <div className="space-y-1">
            <Textarea
              rows={4}
              value={text}
              dir={m.locale === 'ar' ? 'rtl' : 'ltr'}
              lang={m.locale}
              aria-label={t('text')}
              onChange={(e) => setText(e.target.value)}
            />
            <p className="text-xs text-muted">{t(`written.${m.locale}`)}</p>
          </div>
          {logSent.isSuccess && <Alert tone="success">{t('opened')}</Alert>}
          <ApiErrorAlert error={logSent.error} />
          <div className="flex flex-wrap gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={text.trim() === ''}
              className={`${buttonClass()} ${text.trim() === '' ? 'pointer-events-none opacity-50' : ''}`}
              onClick={() => logSent.mutate(template)}
            >
              {t('send')}
            </a>
            <Button type="button" variant="secondary" onClick={onClose}>
              {tCommon('cancel')}
            </Button>
          </div>
        </>
      )}
      {!template && <p className="text-sm text-muted">{t('pick')}</p>}
    </div>
  );
}
