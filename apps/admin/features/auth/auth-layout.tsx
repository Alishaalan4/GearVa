import { Logo } from '@gearva/ui';
import type { ReactNode } from 'react';
import { LanguageToggle } from '@/components/language-toggle';

/** Centered card used by every sign-in step. */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <Logo />
          <LanguageToggle />
        </div>
        <div className="rounded-xl border border-line bg-card p-6">
          <h1 className="mb-5 text-2xl font-extrabold">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
