import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-aware replacements for next/link and next/navigation: they keep /ar or /en.
export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);
