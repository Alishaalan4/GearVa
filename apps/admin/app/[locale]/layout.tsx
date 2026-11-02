import type { Metadata } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { IBM_Plex_Sans_Arabic, Plus_Jakarta_Sans } from 'next/font/google';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import { routing } from '@/i18n/routing';
import '../globals.css';

const latin = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-latin' });
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
});

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: t('title') };
}

/** Root layout: language and text direction (Arabic is right-to-left). */
export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    <html
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      className={`${latin.variable} ${arabic.variable}`}
    >
      <body className="bg-page font-sans text-ink antialiased">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
