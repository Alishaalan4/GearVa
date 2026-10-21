import { z } from 'zod';
import type { EmailTemplate } from './index';

/** Sent when an admin (or later a garage owner) triggers a password reset (flow.md 2.1). */
export const passwordReset: EmailTemplate<{ name: string; link: string; hours: number }> = {
  schema: z.object({ name: z.string().min(1), link: z.url(), hours: z.number().int().positive() }),
  render: ({ name, link, hours }) => ({
    en: {
      subject: 'Reset your Gearva password',
      text: [
        `Hello ${name},`,
        '',
        'Use this link to choose a new password:',
        link,
        '',
        `This link expires in ${hours} hours. If you did not expect it, you can ignore this email.`,
      ].join('\n'),
    },
    ar: {
      subject: 'إعادة تعيين كلمة المرور في Gearva',
      text: [
        `مرحباً ${name}،`,
        '',
        'استخدم هذا الرابط لاختيار كلمة مرور جديدة:',
        link,
        '',
        `تنتهي صلاحية هذا الرابط خلال ${hours} ساعة. إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة.`,
      ].join('\n'),
    },
  }),
};
