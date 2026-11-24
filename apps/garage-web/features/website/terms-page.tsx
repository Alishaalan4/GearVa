import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { PublicShell, SUPPORT_EMAIL } from './public-shell';

/** Each section has a title and paragraphs p1, p2, ... in messages (terms.sections). */
const SECTIONS = {
  about: 2,
  service: 2,
  accounts: 3,
  garages: 3,
  garageDuties: 2,
  owners: 2,
  use: 2,
  data: 1,
  availability: 2,
  liability: 2,
  ending: 3,
  changes: 1,
  law: 1,
  contact: 1,
} as const;

/**
 * Terms and conditions (step 7.8), public at /terms: for the website, the garage app and
 * the owner app. Same frame and layout as the privacy policy.
 */
export function TermsPage() {
  const t = useTranslations('terms');
  return (
    <PublicShell>
      <h1 className="text-3xl font-extrabold">{t('title')}</h1>
      <p className="mt-2 text-sm text-muted">{t('updated')}</p>
      <p className="mt-6 leading-relaxed">{t('intro')}</p>
      {Object.entries(SECTIONS).map(([key, count], index) => (
        <section key={key} className="mt-8">
          <h2 className="mb-2 text-xl font-bold">
            {index + 1}. {t(`sections.${key}.title`)}
          </h2>
          {Array.from({ length: count }, (_, i) => (
            <p key={i} className="mb-3 leading-relaxed text-soft-ink">
              {t(`sections.${key}.p${i + 1}`, { email: SUPPORT_EMAIL })}
            </p>
          ))}
        </section>
      ))}
      <p className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link href="/privacy" className="underline">
          {t('privacyLink')}
        </Link>
        <Link href="/support" className="underline">
          {t('supportLink')}
        </Link>
      </p>
    </PublicShell>
  );
}
