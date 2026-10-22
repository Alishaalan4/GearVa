import type { ReactNode } from 'react';
import { LanguageToggle } from '@/components/language-toggle';

/** Centered card used by every sign-in step. */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <div className="flex justify-end">
          <LanguageToggle />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="mb-5 text-xl font-semibold">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
