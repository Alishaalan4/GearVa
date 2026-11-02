// Small UI building blocks (Tailwind only), shared by garage-web and admin (README 3).
// Logical spacing (ms/me/ps/pe) keeps them correct in Arabic (RTL). Bigger pieces (dialogs,
// menus) come with shadcn/ui when needed. Shipped as source: each app lists @gearva/ui in
// transpilePackages and scans it with @source in app/globals.css. Nothing app-specific
// (i18n, API client) belongs here.
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';

const BUTTON_STYLES = {
  primary: 'bg-brand font-extrabold text-on-brand hover:brightness-95',
  secondary: 'border-[1.5px] border-ink bg-transparent font-bold text-ink hover:bg-soft',
  danger: 'bg-bad font-bold text-bad-ink hover:brightness-95',
} as const;

/** Button look for links, which cannot use <Button>. */
export function buttonClass(variant: keyof typeof BUTTON_STYLES = 'primary') {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-5 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_STYLES[variant]}`;
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON_STYLES }) {
  return <button className={`${buttonClass(variant)} ${className}`} {...props} />;
}

const CONTROL =
  'block min-h-11 w-full rounded-[10px] border border-line bg-field px-3 py-2 text-base font-semibold text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand aria-[invalid=true]:border-bad-ink sm:text-sm';

export function Input({ className = '', ...props }: ComponentProps<'input'>) {
  return <input className={`${CONTROL} ${className}`} {...props} />;
}

export function Select({ className = '', ...props }: ComponentProps<'select'>) {
  return <select className={`${CONTROL} ${className}`} {...props} />;
}

export function Textarea({ className = '', ...props }: ComponentProps<'textarea'>) {
  return <textarea className={`${CONTROL} ${className}`} {...props} />;
}

/** A labelled form control with an optional hint and error. */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted">{hint}</span>}
      {error && (
        <span className="block text-xs text-bad-ink" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

export function Card({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-line bg-card p-4 sm:px-5 ${className}`}>
      {title && <h2 className="mb-3 text-base font-bold">{title}</h2>}
      {children}
    </section>
  );
}

export function Alert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'success';
  children: ReactNode;
}) {
  const styles = tone === 'error' ? 'bg-bad text-bad-ink' : 'bg-ok text-ok-ink';
  return (
    <div
      className={`rounded-[10px] px-3 py-2 text-sm font-medium ${styles}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}

/** The Gearva mark and wordmark. It takes the text colour of whatever surrounds it. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 text-xl font-extrabold ${className}`}
      dir="ltr"
    >
      <svg width="36" height="31" viewBox="0 0 449 390" aria-hidden="true">
        <path
          d="M435.8 154.5 L401.5 153.0 L321.5 154.0 L281.5 154.0 L266.5 160.0 L258.2 166.0 L242.0 184.5 L237.0 194.5 L233.0 208.5 L233.0 225.2 L313.2 225.8 L314.0 227.2 L167.2 376.5 L272.2 376.8 L278.2 375.8 L292.2 370.8 L306.5 361.8 L415.8 252.5 L423.8 244.5 L430.8 235.2 L435.8 221.2Z M434.5 13.2 L225.5 12.0 L203.5 13.0 L197.5 14.0 L181.5 19.0 L169.5 25.0 L148.2 40.0 L36.5 148.0 L26.0 159.5 L17.0 175.5 L13.0 190.5 L13.0 210.2 L16.0 221.2 L21.0 232.2 L28.0 242.5 L52.2 265.8 L122.8 191.5 L159.8 152.5 L177.8 133.5 L195.2 114.8 L205.5 107.8 L220.5 101.8 L231.2 100.8 L232.5 99.8 L350.2 99.8Z"
          fill="currentColor"
        />
        <path
          d="M133.2 218.2 L90.0 262.2 L82.0 270.2 L70.0 284.2 L149.2 362.8 L211.8 299.5 L212.8 296.5 L143.2 227.0Z"
          fill="#FF600F"
        />
      </svg>
      <span>
        GEAR<span className="text-brand">VA</span>
      </span>
    </span>
  );
}

/** Look of a sidebar item (a link or a button): orange when it is the current page. */
export function navItemClass(active = false) {
  return `flex min-h-11 items-center rounded-[10px] px-3.5 py-2 text-start text-sm font-semibold ${
    active ? 'bg-brand text-on-brand' : 'text-sidebar-ink hover:text-white'
  }`;
}

/** The app frame: a dark sidebar on a laptop, a top row on a phone (below 820 px). */
export function AppFrame({
  brand,
  subtitle,
  nav,
  footer,
  children,
}: {
  brand: ReactNode;
  subtitle?: ReactNode;
  nav: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col min-[820px]:flex-row">
      <aside className="flex shrink-0 flex-wrap items-center gap-1 bg-sidebar p-3 text-white min-[820px]:sticky min-[820px]:top-0 min-[820px]:h-dvh min-[820px]:w-59 min-[820px]:flex-col min-[820px]:flex-nowrap min-[820px]:items-stretch min-[820px]:px-3.5 min-[820px]:py-5.5">
        {brand}
        {subtitle && (
          <p className="mb-4 mt-1.5 hidden text-xs text-sidebar-ink min-[820px]:block">
            {subtitle}
          </p>
        )}
        <nav className="flex flex-wrap gap-1 min-[820px]:flex-col">{nav}</nav>
        <div className="flex flex-wrap items-center gap-1 min-[820px]:mt-auto min-[820px]:flex-col min-[820px]:items-stretch">
          {footer}
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 pb-10 pt-5 min-[820px]:px-9 min-[820px]:pb-12 min-[820px]:pt-7">
        {children}
      </main>
    </div>
  );
}

const PILL_STYLES = {
  brand: 'bg-tint text-brand-ink',
  ok: 'bg-ok text-ok-ink',
  bad: 'bg-bad text-bad-ink',
  soft: 'bg-soft text-soft-ink',
} as const;

/** A small status label. */
export function Pill({
  tone = 'soft',
  children,
}: {
  tone?: keyof typeof PILL_STYLES;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-[10px] px-2.5 py-0.5 text-xs font-bold ${PILL_STYLES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Sign-in pages: a dark panel with the pitch beside the form, stacked on a phone. */
export function AuthFrame({
  heading,
  points,
  language,
  title,
  children,
}: {
  heading: string;
  points: string[];
  language: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh min-[820px]:grid-cols-2">
      <div className="flex flex-col justify-center gap-5 bg-sidebar p-8 text-white min-[820px]:p-16">
        <Logo />
        <h2 className="text-3xl font-extrabold leading-tight min-[820px]:text-[42px]">{heading}</h2>
        <ul className="space-y-2 text-[#E5EAE9]">
          {points.map((point) => (
            <li key={point} className="flex items-baseline gap-3">
              <span className="size-2.5 shrink-0 bg-brand" aria-hidden="true" />
              {point}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col items-center justify-center gap-3 p-6 min-[820px]:p-8">
        <div className="flex w-full max-w-110 justify-end">{language}</div>
        <div className="w-full max-w-110 rounded-xl border border-line bg-card p-6 sm:p-8">
          <h1 className="mb-5 text-2xl font-extrabold">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
