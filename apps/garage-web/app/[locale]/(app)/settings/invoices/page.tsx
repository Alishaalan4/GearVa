import { redirect } from '@/i18n/navigation';

/** Step 7.2: the invoice settings are a tab of the Invoices page; old links land there. */
export default async function InvoiceSettingsRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: '/invoices?tab=settings', locale });
}
