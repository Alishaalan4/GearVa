import type { z } from 'zod';
import type { Locale } from '../notification-channel';
import { staffInvite } from './staff-invite';

export interface RenderedEmail {
  subject: string;
  text: string;
}

export interface EmailTemplate<T> {
  /** Validates the notification payload before anything is sent. */
  schema: z.ZodType<T>;
  render(data: T): Record<Locale, RenderedEmail>;
}

/** Template names are stored in notifications.template; add new ones here. */
const EMAIL_TEMPLATES = {
  'staff-invite': staffInvite,
};

export type EmailTemplateName = keyof typeof EMAIL_TEMPLATES;

export function isEmailTemplate(name: string): name is EmailTemplateName {
  return Object.hasOwn(EMAIL_TEMPLATES, name);
}

/** Throws on an unknown template or invalid data; the caller records the failure. */
export function renderEmail(name: string, locale: Locale, data: unknown): RenderedEmail {
  if (!isEmailTemplate(name)) throw new Error(`Unknown email template "${name}"`);
  const template: EmailTemplate<unknown> = EMAIL_TEMPLATES[name];
  return template.render(template.schema.parse(data))[locale];
}
