import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { PublicShell, SUPPORT_EMAIL } from './public-shell';

/** Step 7.7: the support page the app stores link to (Apple asks for a support URL). */
export function SupportPage() {
  const t = useTranslations('support');
  return (
    <PublicShell>
      <h1 className="text-3xl font-extrabold">{t('title')}</h1>
      <p className="mt-6 leading-relaxed">{t('intro')}</p>
      <section className="mt-8 space-y-3 leading-relaxed text-soft-ink">
        <h2 className="text-xl font-bold text-ink">{t('accountTitle')}</h2>
        <p>{t('account')}</p>
        <p>{t('forgot')}</p>
      </section>
      <section className="mt-8 space-y-3 leading-relaxed text-soft-ink">
        <h2 className="text-xl font-bold text-ink">{t('contactTitle')}</h2>
        <p>{t('contact')}</p>
        <p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-semibold text-ink underline"
            dir="ltr"
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
      </section>
      <p className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link href="/delete-account" className="underline">
          {t('deleteLink')}
        </Link>
        <Link href="/privacy" className="underline">
          {t('privacyLink')}
        </Link>
        <Link href="/terms" className="underline">
          {t('termsLink')}
        </Link>
      </p>
    </PublicShell>
  );
}
