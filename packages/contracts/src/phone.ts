import { type CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js';
import { z } from 'zod';

// Phone numbers are stored in E.164 (database.md section 1), e.g. +9613123456, so the
// same number typed as "03 123 456" or "+961 3 123456" is one value everywhere. In
// Phase 2 the car owner's phone is their login identity, so this must never vary.

/** Numbers typed without a country code are read as Lebanese. */
export const DEFAULT_PHONE_COUNTRY: CountryCode = 'LB';

/** The E.164 form of a phone number, or null when it is not a valid number. */
export function normalizePhone(
  input: string,
  defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY,
): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), defaultCountry);
  return parsed?.isValid() ? parsed.number : null;
}

/** A required phone number, validated and turned into E.164. */
export const phoneSchema = z
  .string()
  .trim()
  .max(30)
  .transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number' });
      return z.NEVER;
    }
    return phone;
  });

/** An optional phone number: empty means none (null), anything else must be valid. */
export const optionalPhoneSchema = z
  .string()
  .trim()
  .max(30)
  .transform((value, ctx) => {
    if (value === '') return null;
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number' });
      return z.NEVER;
    }
    return phone;
  })
  .nullable()
  .optional();
