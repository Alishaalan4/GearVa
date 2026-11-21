import { redirect } from '@/i18n/navigation';

/** Step 7.3: the message log is a tab of the Reminders page; old links land there. */
export default async function NotificationsRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: '/reminders?tab=log', locale });
}
