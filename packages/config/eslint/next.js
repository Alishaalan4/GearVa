// ESLint flat config for the Next.js apps (garage-web, admin).
import prettier from 'eslint-config-prettier';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['.next/**', '.turbo/**', 'out/**', 'next-env.d.ts']),
  ...nextVitals,
  ...nextTs,
  prettier,
]);
