import { Logo } from '@gearva/ui';
import { useTranslations } from 'next-intl';
import { LanguageToggle } from '@/components/language-toggle';
import { Link } from '@/i18n/navigation';

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
    <div className="mx-auto max-w-200 px-4 sm:px-6">
      <header className="flex flex-wrap items-center gap-2 py-4">
        <Link href="/welcome" aria-label="Gearva">
          <Logo />
        </Link>
        <span className="flex-1" />
        <LanguageToggle />
      </header>
      <main className="pb-12 pt-4">
        <h1 className="text-3xl font-extrabold">{t('title')}</h1>
        <p className="mt-2 text-sm text-muted">{t('updated')}</p>
        <p className="mt-6 leading-relaxed">{t('intro')}</p>
        {Object.entries(SECTIONS).map(([key, count]) => (
          <section key={key} className="mt-8">
            <h2 className="mb-2 text-xl font-bold">{t(`sections.${key}.title`)}</h2>
            {Array.from({ length: count }, (_, i) => (
              <p key={i} className="mb-3 leading-relaxed text-soft-ink">
                {t(`sections.${key}.p${i + 1}`)}
              </p>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}
