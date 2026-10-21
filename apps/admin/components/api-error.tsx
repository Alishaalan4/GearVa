'use client';

import { useTranslations } from 'next-intl';
import { ApiError } from '@/lib/api';
import { Alert } from './ui';

/** Shows an API error in the user's language, by its error code (never the raw message). */
export function ApiErrorAlert({ error }: { error: unknown }) {
  const t = useTranslations('errors');
  if (!error) return null;
  const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
  return <Alert>{t.has(code) ? t(code) : t('INTERNAL_ERROR')}</Alert>;
}
