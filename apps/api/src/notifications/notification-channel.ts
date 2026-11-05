import type { NotificationChannel as ChannelName } from '@gearva/database';

export type Locale = 'ar' | 'en';

export interface SendInput {
  /** email address, phone number or push token */
  recipient: string;
  template: string;
  locale: Locale;
  data: Record<string, unknown>;
}

/**
 * `retryable` marks a failure that may pass on a later attempt (provider down, rate
 * limited). Without it the failure is final, e.g. a bad address or invalid data. An
 * adapter that throws is treated as retryable.
 */
export type SendResult =
  { ok: true; providerMessageId?: string } | { ok: false; error: string; retryable?: boolean };

/**
 * The one interface every outgoing message goes through (README section 5.5).
 * A new channel (WhatsApp, push) is a new adapter in this folder, registered in
 * notifications.module.ts. Nothing outside notifications/ changes.
 */
export interface NotificationChannel {
  readonly channel: ChannelName;
  send(input: SendInput): Promise<SendResult>;
}

/** Multi-provider token: the list of channels that exist right now. */
export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');
