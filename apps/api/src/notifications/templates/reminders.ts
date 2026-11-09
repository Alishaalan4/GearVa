import { z } from 'zod';
import type { Locale } from '../notification-channel';
import type { EmailTemplate } from './index';

// Reminder emails (flow.md 9.1, 9.2), in the customer's language. Numbers and dates use
// Western digits in Arabic too, as on the invoices.

const car = {
  customerName: z.string().min(1),
  garageName: z.string().min(1),
  /** "Toyota Corolla" */
  vehicle: z.string().min(1),
  plate: z.string().min(1),
  /** the service name in the customer's language */
  serviceName: z.string().min(1),
};
/** YYYY-MM-DD */
const date = z.iso.date();

function day(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function distance(km: number, unit: 'KM' | 'MI', locale: Locale): string {
  const label = { KM: { en: 'km', ar: 'كم' }, MI: { en: 'mi', ar: 'ميل' } }[unit][locale];
  return `${new Intl.NumberFormat('en-US').format(km)} ${label}`;
}

const serviceSchema = z
  .object({
    ...car,
    /** in the car's unit */
    dueKm: z.number().int().nonnegative().nullable(),
    unit: z.enum(['KM', 'MI']),
    dueDate: date.nullable(),
  })
  .refine((d) => d.dueKm !== null || d.dueDate !== null, 'A due km or date is needed');

/** "at 55,100 km or on 5 May 2027, whichever comes first", in the customer's language. */
function serviceDue(d: z.infer<typeof serviceSchema>, locale: Locale): string {
  const km = d.dueKm === null ? null : distance(d.dueKm, d.unit, locale);
  const on = d.dueDate === null ? null : day(d.dueDate, locale);
  if (locale === 'en') {
    if (km && on) return `at ${km} or on ${on}, whichever comes first`;
    return km ? `at ${km}` : `on ${on}`;
  }
  if (km && on) return `عند ${km} أو في ${on}، أيهما أقرب`;
  return km ? `عند ${km}` : `في ${on}`;
}

/** flow.md 9.1: "Kindly check your km, your next change is at [number]." */
export const serviceReminder: EmailTemplate<z.infer<typeof serviceSchema>> = {
  schema: serviceSchema,
  render: (d) => {
    const due = (locale: Locale) => serviceDue(d, locale);
    return {
      en: {
        subject: `${d.serviceName} reminder for ${d.plate}`,
        text: [
          `Hello ${d.customerName},`,
          '',
          `Kindly check your km: the next ${d.serviceName} for your ${d.vehicle} (${d.plate}) is due ${due('en')}.`,
          '',
          `Contact ${d.garageName} to book it.`,
        ].join('\n'),
      },
      ar: {
        subject: `تذكير ${d.serviceName} لسيارتك ${d.plate}`,
        text: [
          `مرحباً ${d.customerName}،`,
          '',
          `يرجى التحقق من عدّاد سيارتك: موعد ${d.serviceName} القادم لسيارتك ${d.vehicle} (${d.plate}) ${due('ar')}.`,
          '',
          `تواصل مع ${d.garageName} لحجز موعد.`,
        ].join('\n'),
      },
    };
  },
};

const datedSchema = z.object({ ...car, dueDate: date });

/** A warranty given on a service ends soon. */
export const warrantyEnd: EmailTemplate<z.infer<typeof datedSchema>> = {
  schema: datedSchema,
  render: (d) => ({
    en: {
      subject: `Your warranty for ${d.serviceName} ends soon`,
      text: [
        `Hello ${d.customerName},`,
        '',
        `The warranty on the ${d.serviceName} of your ${d.vehicle} (${d.plate}) ends on ${day(d.dueDate, 'en')}.`,
        `If anything is wrong with it, contact ${d.garageName} before then.`,
      ].join('\n'),
    },
    ar: {
      subject: `تنتهي كفالة ${d.serviceName} قريباً`,
      text: [
        `مرحباً ${d.customerName}،`,
        '',
        `تنتهي كفالة ${d.serviceName} لسيارتك ${d.vehicle} (${d.plate}) في ${day(d.dueDate, 'ar')}.`,
        `إذا لاحظت أي مشكلة، تواصل مع ${d.garageName} قبل هذا التاريخ.`,
      ].join('\n'),
    },
  }),
};

/** The mechanic recommended a service in N months. */
export const recommendedNext: EmailTemplate<z.infer<typeof datedSchema>> = {
  schema: datedSchema,
  render: (d) => ({
    en: {
      subject: `${d.serviceName} recommended for ${d.plate}`,
      text: [
        `Hello ${d.customerName},`,
        '',
        `At your last visit, ${d.garageName} recommended a ${d.serviceName} for your ${d.vehicle} (${d.plate}) around ${day(d.dueDate, 'en')}.`,
        '',
        `Contact ${d.garageName} to book it.`,
      ].join('\n'),
    },
    ar: {
      subject: `ننصح بـ${d.serviceName} لسيارتك ${d.plate}`,
      text: [
        `مرحباً ${d.customerName}،`,
        '',
        `في زيارتك الأخيرة، نصح ${d.garageName} بـ${d.serviceName} لسيارتك ${d.vehicle} (${d.plate}) في حدود ${day(d.dueDate, 'ar')}.`,
        '',
        `تواصل مع ${d.garageName} لحجز موعد.`,
      ].join('\n'),
    },
  }),
};

const monthlySchema = z.object({
  customerName: z.string().min(1),
  garageName: z.string().min(1),
});

/** flow.md 9.2: the general monthly reminder, when the garage turned it on. */
export const monthlyReminder: EmailTemplate<z.infer<typeof monthlySchema>> = {
  schema: monthlySchema,
  render: (d) => ({
    en: {
      subject: `A reminder from ${d.garageName}`,
      text: [
        `Hello ${d.customerName},`,
        '',
        'A friendly monthly reminder to check your car: oil, tyres, brakes and lights.',
        `${d.garageName} is here when you need it.`,
      ].join('\n'),
    },
    ar: {
      subject: `تذكير من ${d.garageName}`,
      text: [
        `مرحباً ${d.customerName}،`,
        '',
        'تذكير شهري ودّي بفحص سيارتك: الزيت، الإطارات، المكابح والأضواء.',
        `${d.garageName} في خدمتك متى احتجت.`,
      ].join('\n'),
    },
  }),
};

/**
 * flow.md 9.5: the message staff send from their own WhatsApp, in the customer's
 * language. Shorter than the email, with the same due text.
 */
export function whatsappReminderText(
  kind: 'SERVICE_DUE' | 'WARRANTY_END' | 'RECOMMENDED_NEXT',
  data: z.input<typeof serviceSchema>,
  locale: Locale,
): string {
  const d = serviceSchema.parse(data);
  const hello =
    locale === 'en'
      ? `Hello ${d.customerName}, this is ${d.garageName}.`
      : `مرحباً ${d.customerName}، معك ${d.garageName}.`;
  if (kind === 'WARRANTY_END' && d.dueDate) {
    return locale === 'en'
      ? `${hello} The warranty on the ${d.serviceName} of your ${d.vehicle} (${d.plate}) ends on ${day(d.dueDate, 'en')}.`
      : `${hello} تنتهي كفالة ${d.serviceName} لسيارتك ${d.vehicle} (${d.plate}) في ${day(d.dueDate, 'ar')}.`;
  }
  if (kind === 'RECOMMENDED_NEXT' && d.dueDate) {
    return locale === 'en'
      ? `${hello} We recommended a ${d.serviceName} for your ${d.vehicle} (${d.plate}) around ${day(d.dueDate, 'en')}. Reply to book it.`
      : `${hello} ننصح بـ${d.serviceName} لسيارتك ${d.vehicle} (${d.plate}) في حدود ${day(d.dueDate, 'ar')}. راسلنا لحجز موعد.`;
  }
  return locale === 'en'
    ? `${hello} Kindly check your km: the next ${d.serviceName} for your ${d.vehicle} (${d.plate}) is due ${serviceDue(d, 'en')}. Reply to book it.`
    : `${hello} يرجى التحقق من عدّاد سيارتك: موعد ${d.serviceName} القادم لسيارتك ${d.vehicle} (${d.plate}) ${serviceDue(d, 'ar')}. راسلنا لحجز موعد.`;
}
