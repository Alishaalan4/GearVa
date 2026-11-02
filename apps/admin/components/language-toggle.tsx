'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';

/** Switches between Arabic and English on the same page. */
export function LanguageToggle({
  className = 'text-sm text-soft-ink hover:text-ink',
}: {
  className?: string;
}) {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => router.replace(pathname, { locale: locale === 'ar' ? 'en' : 'ar' })}
    >
      {t('switchLanguage')}
    </button>
  );
}
