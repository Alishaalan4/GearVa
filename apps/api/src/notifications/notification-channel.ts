import type { NotificationChannel as ChannelName } from '@gearva/database';

export type Locale = 'ar' | 'en';

export interface SendInput {
  /** email address, phone number or push token */
  recipient: string;
  template: string;
  locale: Locale;
  data: Record<string, unknown>;
}

export type SendResult = { ok: true; providerMessageId?: string } | { ok: false; error: string };

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
