import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';
import type { NotificationChannel, SendInput, SendResult } from '../notification-channel';
import { renderEmail } from '../templates';

const RESEND_URL = 'https://api.resend.com/emails';

/**
 * EMAIL_ADAPTER=resend: sends through Resend's HTTP API (README 9). No SDK: one POST.
 * A rate limit or a Resend outage is retried by the notification queue; a refused email
 * (bad address, unverified sender) is final.
 */
@Injectable()
export class ResendEmailChannel implements NotificationChannel {
  readonly channel = 'EMAIL' as const;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async send(input: SendInput): Promise<SendResult> {
    let email;
    try {
      email = renderEmail(input.template, input.locale, input.data);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    const response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.env.EMAIL_FROM,
        to: [input.recipient],
        subject: email.subject,
        text: email.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json().catch(() => null)) as {
      id?: string;
      message?: string;
    } | null;
    if (response.ok) return { ok: true, providerMessageId: body?.id };
    return {
      ok: false,
      error: `Resend ${response.status}: ${body?.message ?? response.statusText}`,
      retryable: response.status === 429 || response.status >= 500,
    };
  }
}
