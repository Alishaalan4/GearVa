import { redirect } from '@/i18n/navigation';

/** Step 7.4: Gearva sets a garage's reminder settings now; old links land on Reminders. */
export default async function ReminderSettingsRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: '/reminders', locale });
}
