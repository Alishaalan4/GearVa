import type { z } from 'zod';
import type { Locale } from '../notification-channel';
import { datedSchema, day, serviceDue, serviceSchema } from './reminders';

/** An inbox entry and its push: a short title and one or two sentences (mobile-api.md 6). */
export interface InAppText {
  title: string;
  body: string;
}

interface InAppTemplate<T> {
  schema: z.ZodType<T>;
  render(data: T, locale: Locale): InAppText;
}

// The in-app texts of the reminders (flow.md 9.1), with the same data as their emails, so
// the scan writes one payload for both. Shorter than the email: they show on a lock screen.
/** Keeps each template's own data type while storing them in one map. */
const template = <T>(t: InAppTemplate<T>): InAppTemplate<unknown> => t as InAppTemplate<unknown>;

const IN_APP_TEMPLATES: Record<string, InAppTemplate<unknown>> = {
  'service-reminder': template({
    schema: serviceSchema,
    render: (d: z.infer<typeof serviceSchema>, locale: Locale) =>
      locale === 'en'
        ? {
            title: `${d.serviceName} due soon`,
            body: `Kindly check your km: the next ${d.serviceName} for your ${d.vehicle} (${d.plate}) is due ${serviceDue(d, 'en')}. ${d.garageName}`,
          }
        : {
            title: `موعد ${d.serviceName} يقترب`,
            body: `يرجى التحقق من عدّاد سيارتك: موعد ${d.serviceName} القادم لسيارتك ${d.vehicle} (${d.plate}) ${serviceDue(d, 'ar')}. ${d.garageName}`,
          },
  }),
  'warranty-end': template({
    schema: datedSchema,
    render: (d: z.infer<typeof datedSchema>, locale: Locale) =>
      locale === 'en'
        ? {
            title: `${d.serviceName} warranty ends soon`,
            body: `The warranty on the ${d.serviceName} of your ${d.vehicle} (${d.plate}) ends on ${day(d.dueDate, 'en')}. ${d.garageName}`,
          }
        : {
            title: `تنتهي كفالة ${d.serviceName} قريباً`,
            body: `تنتهي كفالة ${d.serviceName} لسيارتك ${d.vehicle} (${d.plate}) في ${day(d.dueDate, 'ar')}. ${d.garageName}`,
          },
  }),
  'recommended-next': template({
    schema: datedSchema,
    render: (d: z.infer<typeof datedSchema>, locale: Locale) =>
      locale === 'en'
        ? {
            title: `${d.serviceName} recommended`,
            body: `${d.garageName} recommended a ${d.serviceName} for your ${d.vehicle} (${d.plate}) around ${day(d.dueDate, 'en')}.`,
          }
        : {
            title: `ننصح بـ${d.serviceName}`,
            body: `نصح ${d.garageName} بـ${d.serviceName} لسيارتك ${d.vehicle} (${d.plate}) في حدود ${day(d.dueDate, 'ar')}.`,
          },
  }),
};

export function isInAppTemplate(name: string): boolean {
  return Object.hasOwn(IN_APP_TEMPLATES, name);
}

/** Throws on an unknown template or invalid data; the caller records the failure. */
export function renderInApp(name: string, locale: Locale, data: unknown): InAppText {
  const found = IN_APP_TEMPLATES[name];
  if (!found) throw new Error(`Unknown in-app template "${name}"`);
  return found.render(found.schema.parse(data), locale);
}
