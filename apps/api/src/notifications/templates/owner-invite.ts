import { z } from 'zod';
import type { EmailTemplate } from './index';

/**
 * Sent to a car owner when their garage taps "Invite to the app" (flow.md 2.4): the link
 * to set the password they will use in the Gearva owner app.
 */
export const ownerInvite: EmailTemplate<{ name: string; garageName: string; link: string }> = {
  schema: z.object({ name: z.string().min(1), garageName: z.string().min(1), link: z.url() }),
  render: ({ name, garageName, link }) => ({
    en: {
      subject: `${garageName} invites you to the Gearva app`,
      text: [
        `Hello ${name},`,
        '',
        `${garageName} invites you to the Gearva app, where you can see your cars, their service history, your invoices and when the next service is due.`,
        '',
        'Set your password here:',
        link,
        '',
        'Then download the Gearva app and sign in with this email and your password.',
        'This link expires in 7 days.',
      ].join('\n'),
    },
    ar: {
      subject: `${garageName} يدعوك إلى تطبيق Gearva`,
      text: [
        `مرحباً ${name}،`,
        '',
        `يدعوك ${garageName} إلى تطبيق Gearva، حيث ترى سياراتك وسجل صيانتها وفواتيرك وموعد الصيانة القادمة.`,
        '',
        'عيّن كلمة المرور من هنا:',
        link,
        '',
        'ثم حمّل تطبيق Gearva وسجّل الدخول بهذا البريد وكلمة المرور.',
        'تنتهي صلاحية هذا الرابط خلال 7 أيام.',
      ].join('\n'),
    },
  }),
};
