// Normalized forms used for search and uniqueness (database.md 1 and 4.4). The value as
// typed is always kept for display; only these forms are compared.

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits as ASCII, for Arabic keyboards. */
function asciiDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * A plate for search and the per-garage uniqueness check: uppercase, Arabic digits as
 * ASCII, and no spaces or dashes. "b 123-456" and "B123456" are the same car.
 */
export function normalizePlate(plate: string): string {
  return asciiDigits(plate.normalize('NFKC'))
    .toUpperCase()
    .replace(/[\s\-‐-―−]/g, '');
}

/**
 * A suggestion value (flow.md 4.3): lowercase, trimmed, inner spaces collapsed, so
 * "Castrol", " castrol " and "CASTROL" are one entry. The display value keeps the
 * first spelling used.
 */
export function normalizeSuggestion(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}
