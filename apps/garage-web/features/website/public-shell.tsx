import { Logo } from '@gearva/ui';
import type { ReactNode } from 'react';
import { LanguageToggle } from '@/components/language-toggle';
import { Link } from '@/i18n/navigation';

/** Support email for the website and the app stores (step 7.7, user decision 2026-11-23). */
export const SUPPORT_EMAIL = 'gearvalueapp@gmail.com';

/** The frame of the public pages that need no sign-in: privacy, support, delete account. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-200 px-4 sm:px-6">
      <header className="flex flex-wrap items-center gap-2 py-4">
        <Link href="/welcome" aria-label="Gearva">
          <Logo />
        </Link>
        <span className="flex-1" />
        <LanguageToggle />
      </header>
      <main className="pb-12 pt-4">{children}</main>
    </div>
  );
}
