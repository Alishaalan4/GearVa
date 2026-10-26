// Money is integer cents (README 5.4). Quantities have at most 2 decimals
// (service_records.quantity numeric(8,2)), so a line total is computed in integers:
// no floating point ever touches an amount.

/** A quantity like 1, 1.5 or "2.25" as hundredths (150 for 1.5), validated. */
export function quantityToHundredths(quantity: number | string): number {
  const text = typeof quantity === 'number' ? String(quantity) : quantity.trim();
  const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match)
    throw new Error(`Quantity must be a positive number with at most 2 decimals: ${text}`);
  const hundredths = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (hundredths <= 0) throw new Error('Quantity must be more than 0');
  return hundredths;
}

/**
 * quantity x unit price in cents, rounded to the nearest cent with halves going up
 * (decision 2026-10-24): 1.5 x 333 = 499.5 -> 500.
 */
export function lineTotalCents(quantity: number | string, unitPriceCents: number): number {
  if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) {
    throw new Error('Unit price must be a whole number of cents, 0 or more');
  }
  const product = quantityToHundredths(quantity) * unitPriceCents;
  if (!Number.isSafeInteger(product)) throw new Error('Line total is too large');
  return Math.floor((product + 50) / 100);
}
