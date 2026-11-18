import { z } from 'zod';
import type { EmailTemplate } from './index';

interface AnnouncementEmail {
  name: string;
  garageName: string;
  title: string;
  body: string;
}

/**
 * A message from Gearva to a garage owner (flow.md 11.9, step 5.10). The admin writes the
 * title and text once, in the language they choose; only the greeting and the closing
 * line follow the owner's language.
 */
export const announcement: EmailTemplate<AnnouncementEmail> = {
  schema: z.object({
    name: z.string().min(1),
    garageName: z.string().min(1),
    title: z.string().min(1),
    body: z.string().min(1),
  }),
  render: ({ name, garageName, title, body }) => ({
    en: {
      subject: title,
      text: [
        `Hello ${name},`,
        '',
        body,
        '',
        `You get this message as the owner of ${garageName} on Gearva. It also shows at the top of the Gearva app.`,
      ].join('\n'),
    },
    ar: {
      subject: title,
      text: [
        `مرحباً ${name}،`,
        '',
        body,
        '',
        `تصلك هذه الرسالة بصفتك مالك ${garageName} على Gearva. تظهر أيضاً في أعلى تطبيق Gearva.`,
      ].join('\n'),
    },
  }),
};
