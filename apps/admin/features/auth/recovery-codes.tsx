'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@gearva/ui';

/** Shown once, right after 2FA is turned on (flow.md 2.3). */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const t = useTranslations('recovery');
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t('intro')}</p>
      <ul className="grid grid-cols-2 gap-2 rounded-md bg-slate-50 p-3 font-mono text-sm" dir="ltr">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={() =>
          void navigator.clipboard.writeText(codes.join('\n')).then(() => setCopied(true))
        }
      >
        {copied ? t('copied') : t('copy')}
      </Button>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        {t('saved')}
      </label>
      <Button type="button" className="w-full" disabled={!saved} onClick={onDone}>
        {t('continue')}
      </Button>
    </div>
  );
}
