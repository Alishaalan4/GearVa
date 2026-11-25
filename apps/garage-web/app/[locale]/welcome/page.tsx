import { setRequestLocale } from 'next-intl/server';
import { LandingPage } from '@/features/website/landing-page';

/** The public website (flow.md 11.6), shown at gearva.online/en and /ar (step 7.9). No sign-in. */
export default async function WelcomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LandingPage />;
}
