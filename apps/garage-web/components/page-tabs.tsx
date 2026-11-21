'use client';

/**
 * Tabs under a page title (steps 7.2 and 7.3). The page keeps the chosen tab in the
 * address (?tab=…), so a reload or a shared link opens the same tab.
 */
export function PageTabs<T extends string>({
  tabs,
  current,
  label,
  onChange,
}: {
  tabs: readonly T[];
  current: T;
  label: (tab: T) => string;
  onChange: (tab: T) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-line" role="tablist">
      {tabs.map((name) => (
        <button
          key={name}
          type="button"
          role="tab"
          aria-selected={current === name}
          className={`-mb-px min-h-10 border-b-2 px-4 text-sm font-semibold ${
            current === name
              ? 'border-brand text-ink'
              : 'border-transparent text-muted hover:text-ink'
          }`}
          onClick={() => onChange(name)}
        >
          {label(name)}
        </button>
      ))}
    </div>
  );
}
