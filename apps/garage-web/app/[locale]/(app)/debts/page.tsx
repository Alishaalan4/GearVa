import { redirect } from '@/i18n/navigation';

/** Step 7.5: income and debts are one Revenue page; old links land there. */
export default async function DebtsRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: '/revenue', locale });
}
