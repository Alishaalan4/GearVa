import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { PublicShell, SUPPORT_EMAIL } from './public-shell';

/** Each section has a title and paragraphs p1, p2, ... in messages (privacy.sections). */
const SECTIONS = {
  who: 2,
  collect: 3,
  use: 2,
  share: 2,
  keep: 2,
  rights: 2,
  security: 1,
  contact: 1,
} as const;

/**
 * The privacy policy (step 6.1), public at /privacy: the app stores require a link to it
 * for the owner app, and it covers the garage app and the website too.
 */
export function PrivacyPage() {
  const t = useTranslations('privacy');
  return (
    <PublicShell>
      <h1 className="text-3xl font-extrabold">{t('title')}</h1>
      <p className="mt-2 text-sm text-muted">{t('updated')}</p>
      <p className="mt-6 leading-relaxed">{t('intro')}</p>
      {Object.entries(SECTIONS).map(([key, count]) => (
        <section key={key} className="mt-8">
          <h2 className="mb-2 text-xl font-bold">{t(`sections.${key}.title`)}</h2>
          {Array.from({ length: count }, (_, i) => (
            <p key={i} className="mb-3 leading-relaxed text-soft-ink">
              {t(`sections.${key}.p${i + 1}`, { email: SUPPORT_EMAIL })}
            </p>
          ))}
        </section>
      ))}
      <p className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link href="/delete-account" className="underline">
          {t('deleteLink')}
        </Link>
        <Link href="/support" className="underline">
          {t('supportLink')}
        </Link>
      </p>
    </PublicShell>
  );
}
