import { z } from 'zod';
import type { EmailTemplate } from './index';

interface ApplicationAlert {
  garageName: string;
  ownerName: string;
  email: string;
  phone: string;
  city: string;
  branchCount: number;
  message: string | null;
  /** the application in the admin app, when APP_URL_ADMIN is set */
  link: string | null;
}

/**
 * Step 7.1 (flow.md 11.6): a garage applied on the website. Sent to the address in the
 * admin's settings, in English (the admin's working language). The link line on its own
 * becomes the orange button in the HTML part.
 */
export const applicationAlert: EmailTemplate<ApplicationAlert> = {
  schema: z.object({
    garageName: z.string().min(1),
    ownerName: z.string().min(1),
    email: z.string().min(1),
    phone: z.string().min(1),
    city: z.string().min(1),
    branchCount: z.number().int().min(1),
    message: z.string().nullable(),
    link: z.url().nullable(),
  }),
  render: (a) => {
    const details = (labels: {
      owner: string;
      email: string;
      phone: string;
      city: string;
      branches: string;
      message: string;
    }) => [
      `${labels.owner}: ${a.ownerName}`,
      `${labels.email}: ${a.email}`,
      `${labels.phone}: ${a.phone}`,
      `${labels.city}: ${a.city}`,
      `${labels.branches}: ${a.branchCount}`,
      ...(a.message ? ['', `${labels.message}:`, a.message] : []),
    ];
    return {
      en: {
        subject: `New garage application: ${a.garageName}`,
        text: [
          `${a.garageName} applied to use Gearva.`,
          '',
          ...details({
            owner: 'Owner',
            email: 'Email',
            phone: 'Phone',
            city: 'City',
            branches: 'Branches',
            message: 'Message',
          }),
          '',
          a.link
            ? 'Open it in the admin to approve or reject it:'
            : 'Open Applications in the admin to approve or reject it.',
          ...(a.link ? [a.link] : []),
        ].join('\n'),
      },
      ar: {
        subject: `طلب كراج جديد: ${a.garageName}`,
        text: [
          `قدّم ${a.garageName} طلباً لاستخدام Gearva.`,
          '',
          ...details({
            owner: 'المالك',
            email: 'البريد',
            phone: 'الهاتف',
            city: 'المدينة',
            branches: 'الفروع',
            message: 'الرسالة',
          }),
          '',
          a.link
            ? 'افتحه في لوحة الإدارة للموافقة أو الرفض:'
            : 'افتح الطلبات في لوحة الإدارة للموافقة أو الرفض.',
          ...(a.link ? [a.link] : []),
        ].join('\n'),
      },
    };
  },
};
