import { AuthFrame } from '@gearva/ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { LanguageToggle } from '@/components/language-toggle';

/** The frame of every sign-in step. */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  const t = useTranslations('authSide');
  return (
    <AuthFrame
      heading={t('heading')}
      points={[t('point1'), t('point2'), t('point3')]}
      language={<LanguageToggle />}
      title={title}
    >
      {children}
    </AuthFrame>
  );
}
