import { z } from 'zod';
import type { EmailTemplate } from './index';

/** Sent to a new garage OWNER (or staff member) to set their password (flow.md 2.1). */
export const staffInvite: EmailTemplate<{ name: string; garageName: string; link: string }> = {
  schema: z.object({ name: z.string().min(1), garageName: z.string().min(1), link: z.url() }),
  render: ({ name, garageName, link }) => ({
    en: {
      subject: 'Your Gearva account is ready',
      text: [
        `Hello ${name},`,
        '',
        `${garageName} now uses Gearva. Set your password to sign in:`,
        link,
        '',
        'This link expires in 7 days.',
      ].join('\n'),
    },
    ar: {
      subject: 'حسابك على Gearva جاهز',
      text: [
        `مرحباً ${name}،`,
        '',
        `أصبح ${garageName} يستخدم Gearva. عيّن كلمة المرور لتسجيل الدخول:`,
        link,
        '',
        'تنتهي صلاحية هذا الرابط خلال 7 أيام.',
      ].join('\n'),
    },
  }),
};
