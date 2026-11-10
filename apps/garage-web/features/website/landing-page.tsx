'use client';

import type { PublicPricing } from '@gearva/contracts';
import { Card, Logo, buttonClass } from '@gearva/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { LanguageToggle } from '@/components/language-toggle';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useMoney } from '@/lib/format';
import { ApplyForm } from './apply-form';

const FEATURES = ['quick', 'reminders', 'channels', 'invoices', 'staff', 'private'] as const;
const STEPS = ['apply', 'account', 'customers', 'reminders'] as const;
const INCLUDED = ['customers', 'reminders', 'invoices', 'staff'] as const;
const QUESTIONS = ['app', 'data', 'start'] as const;

function Section({
  id,
  title,
  lead,
  children,
}: {
  id?: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4 py-10 min-[820px]:py-12">
      <h2 className="mb-2 text-2xl font-extrabold min-[820px]:text-3xl">{title}</h2>
      {lead && <p className="mb-6 max-w-160 leading-relaxed text-muted">{lead}</p>}
      {children}
    </section>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 min-[960px]:grid-cols-3">{children}</div>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="text-sidebar-ink">{label}</span>
      <b>{value}</b>
    </div>
  );
}

/**
 * The public website (flow.md 11.6): what Gearva does, the prices from the admin's system
 * settings, and the Apply form. A visitor who is not signed in lands here from "/".
 */
export function LandingPage() {
  const t = useTranslations('website');
  const money = useMoney({ whole: true });
  const pricing = useQuery({
    queryKey: ['public', 'pricing'],
    queryFn: () => api<PublicPricing>('/v1/public/pricing'),
    staleTime: 10 * 60_000,
  });

  return (
    <div className="mx-auto max-w-280 px-4 sm:px-6">
      <header className="flex flex-wrap items-center gap-2 py-4">
        <Logo />
        <span className="flex-1" />
        <nav className="hidden items-center gap-1 text-sm font-semibold min-[820px]:flex">
          <a href="#features" className="px-2.5 py-2">
            {t('nav.features')}
          </a>
          <a href="#how" className="px-2.5 py-2">
            {t('nav.how')}
          </a>
          <a href="#pricing" className="px-2.5 py-2">
            {t('nav.pricing')}
          </a>
        </nav>
        <LanguageToggle />
        <Link href="/login" className={buttonClass('secondary')}>
          {t('signIn')}
        </Link>
        <a href="#apply" className={`${buttonClass()} hidden sm:inline-flex`}>
          {t('applyNow')}
        </a>
      </header>

      <main>
        <div className="grid items-center gap-10 py-8 min-[820px]:grid-cols-[1.1fr_0.9fr] min-[820px]:py-12">
          <div>
            <h1 className="text-[32px] font-extrabold leading-tight min-[820px]:text-[46px]">
              {t('hero.title')} <span className="text-brand">{t('hero.titleAccent')}</span>
            </h1>
            <p className="my-5 max-w-130 text-[17px] leading-relaxed text-muted">
              {t('hero.lead')}
            </p>
            <div className="flex flex-wrap gap-2">
              <a href="#apply" className={buttonClass()}>
                {t('hero.apply')}
              </a>
              <a href="#how" className={buttonClass('secondary')}>
                {t('hero.how')}
              </a>
            </div>
          </div>
          <div className="rounded-2xl bg-sidebar p-6 text-white min-[820px]:p-7">
            <p className="mb-2 font-semibold">{t('sample.sent')}</p>
            <p className="rounded-xl bg-[#E7F8EC] px-3.5 py-3 font-medium leading-snug text-[#101A19]">
              {t('sample.message')}
            </p>
            <div className="my-3.5 flex flex-wrap gap-2">
              <span className="rounded-[10px] bg-ok px-2.5 py-0.5 text-xs font-bold text-ok-ink">
                {t('sample.email')}
              </span>
              <span className="rounded-[10px] bg-ok px-2.5 py-0.5 text-xs font-bold text-ok-ink">
                {t('sample.whatsapp')}
              </span>
            </div>
            <Row label={t('sample.car')} value={t('sample.km')} />
            <Row label={t('sample.dueLabel')} value={t('sample.due')} />
          </div>
        </div>

        <Section id="features" title={t('features.title')} lead={t('features.lead')}>
          <Grid>
            {FEATURES.map((f) => (
              <Card key={f}>
                <h3 className="mb-1.5 font-bold">{t(`features.${f}.title`)}</h3>
                <p className="text-sm leading-relaxed text-muted">{t(`features.${f}.text`)}</p>
              </Card>
            ))}
          </Grid>
        </Section>

        <Section id="how" title={t('how.title')} lead={t('how.lead')}>
          <Grid>
            {STEPS.map((s, i) => (
              <Card key={s}>
                <span className="mb-2.5 flex size-7.5 items-center justify-center rounded-full bg-brand font-extrabold text-on-brand">
                  {i + 1}
                </span>
                <h3 className="mb-1.5 font-bold">{t(`how.${s}.title`)}</h3>
                <p className="text-sm leading-relaxed text-muted">{t(`how.${s}.text`)}</p>
              </Card>
            ))}
          </Grid>
        </Section>

        <section id="pricing" className="scroll-mt-4 py-10 min-[820px]:py-12">
          <div className="grid items-center gap-6 rounded-2xl bg-sidebar p-6 text-white min-[820px]:grid-cols-2 min-[820px]:p-7">
            <div>
              <p>{t('pricing.title')}</p>
              {pricing.data ? (
                <>
                  <p className="text-5xl font-extrabold">
                    {money(pricing.data.yearPriceCents)}{' '}
                    <small className="text-base font-semibold text-sidebar-ink">
                      {t('pricing.perYear')}
                    </small>
                  </p>
                  <p className="mt-2">
                    {t('pricing.details', {
                      branch: money(pricing.data.extraBranchPriceCents),
                      days: pricing.data.trialDays,
                    })}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sidebar-ink">{t('pricing.ask')}</p>
              )}
            </div>
            <div>
              {INCLUDED.map((k) => (
                <Row key={k} label={t(`pricing.included.${k}`)} value={t('pricing.yes')} />
              ))}
            </div>
          </div>
        </section>

        <Section title={t('questions.title')}>
          <Grid>
            {QUESTIONS.map((q) => (
              <Card key={q}>
                <h3 className="mb-1.5 font-bold">{t(`questions.${q}.q`)}</h3>
                <p className="text-sm leading-relaxed text-muted">{t(`questions.${q}.a`)}</p>
              </Card>
            ))}
          </Grid>
        </Section>

        <Section id="apply" title={t('apply.title')} lead={t('apply.lead')}>
          <Card className="relative">
            <ApplyForm />
          </Card>
        </Section>
      </main>

      <footer className="flex flex-wrap justify-between gap-3 border-t border-line pb-10 pt-6 text-sm text-muted">
        <span>{t('footer')}</span>
        <Link href="/login" className="underline">
          {t('signIn')}
        </Link>
      </footer>
    </div>
  );
}
