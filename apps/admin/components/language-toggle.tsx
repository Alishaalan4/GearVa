'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';

/** Switches between Arabic and English on the same page. */
export function LanguageToggle() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-sm text-slate-700 hover:text-slate-900"
      onClick={() => router.replace(pathname, { locale: locale === 'ar' ? 'en' : 'ar' })}
    >
      {t('switchLanguage')}
    </button>
  );
}
