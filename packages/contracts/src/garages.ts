import { z } from 'zod';
import { addMonths } from './next-due';
import { paginationQuerySchema } from './pagination';
import { phoneSchema } from './phone';

// Admin garage management (flow.md 2.1, 11.1). Shared by the API and the admin web app.

export const GARAGE_STATUSES = ['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED'] as const;
export type GarageStatus = (typeof GARAGE_STATUSES)[number];

export const LOCALES = ['ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** The default free trial length; the `trial.days` system setting overrides it (step 5.3). */
export const TRIAL_DAYS = 30;

const today = () => new Date().toISOString().slice(0, 10);

const garageFields = {
  name: z.string().trim().min(2).max(120),
  /** Also the owner's login email and where the invite goes. */
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  phone: phoneSchema,
  locationText: z.string().trim().min(2).max(200),
  timezone: z
    .string()
    .default('Asia/Beirut')
    .refine((tz) => Intl.supportedValuesOf('timeZone').includes(tz) || tz === 'UTC', {
      message: 'Unknown time zone',
    }),
  defaultLocale: z.enum(LOCALES),
  ownerName: z.string().trim().min(2).max(120),
};

export const createGarageSchema = z.discriminatedUnion('plan', [
  z.object({ ...garageFields, plan: z.literal('TRIAL') }),
  z.object({
    ...garageFields,
    plan: z.literal('PAID'),
    /** Last paid day, YYYY-MM-DD. Access ends at the end of that day (UTC). */
    paidUntil: z.iso.date().refine((d) => d >= today(), { message: 'Must be today or later' }),
  }),
]);
export type CreateGarageInput = z.infer<typeof createGarageSchema>;

export const garageListQuerySchema = paginationQuerySchema.extend({
  /** Matches name or email, case-insensitive. */
  q: z.string().trim().max(100).optional(),
  status: z.enum(GARAGE_STATUSES).optional(),
});
export type GarageListQuery = z.infer<typeof garageListQuerySchema>;

export const suspendGarageSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type SuspendGarageInput = z.infer<typeof suspendGarageSchema>;

// ---------------------------------------------------------------------------
// Subscription lifecycle (flow.md 11.1, step 5.2)
// ---------------------------------------------------------------------------

export const SUBSCRIPTION_PAYMENT_METHODS = ['CASH', 'WHISH'] as const;
export type SubscriptionPaymentMethod = (typeof SUBSCRIPTION_PAYMENT_METHODS)[number];

/**
 * POST /admin/v1/garages/:garageId/payments. Dates are YYYY-MM-DD; access ends at the end
 * of `newExpiryDate` (UTC), like `paidUntil` when a garage is created.
 */
export const recordSubscriptionPaymentSchema = z
  .object({
    amountCents: z.number().int().positive().max(100_000_000),
    method: z.enum(SUBSCRIPTION_PAYMENT_METHODS),
    /** the day the money was received; not in the future */
    paidOn: z.iso.date().refine((d) => d <= today(), { message: 'Cannot be in the future' }),
    /** the new last paid day; today or later, so the garage is usable at once */
    newExpiryDate: z.iso.date().refine((d) => d >= today(), { message: 'Must be today or later' }),
    /** extra branches this payment covers, beyond the main one */
    extraBranches: z.number().int().min(0).max(50).default(0),
    note: z
      .string()
      .trim()
      .max(500)
      .transform((v) => (v === '' ? null : v))
      .nullable()
      .optional(),
  })
  .refine((p) => p.newExpiryDate >= p.paidOn, {
    message: 'The new expiry date cannot be before the payment date',
    path: ['newExpiryDate'],
  });
export type RecordSubscriptionPaymentInput = z.infer<typeof recordSubscriptionPaymentSchema>;

/** POST /admin/v1/garages/:garageId/extend-trial: the new last trial day (flow.md 11.1). */
export const extendTrialSchema = z.object({
  trialEndsOn: z.iso.date().refine((d) => d >= today(), { message: 'Must be today or later' }),
});
export type ExtendTrialInput = z.infer<typeof extendTrialSchema>;

/**
 * flow.md 11.1: the suggested new expiry date of a payment: 12 months after the current
 * paid period if it has not ended yet, else 12 months from today. A trial does not count.
 */
export function suggestNewExpiry(paidUntil: string | null, today: string): string {
  const from = paidUntil && paidUntil >= today ? paidUntil : today;
  return addMonths(from, 12);
}

// Responses. Dates are ISO strings in JSON.

export interface GarageListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: GarageStatus;
  isPaid: boolean;
  trialEndsAt: string | null;
  expiresAt: string | null;
  branchCount: number;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface GarageOwnerSummary {
  id: string;
  name: string;
  email: string;
  /** false until the owner opens the invite and sets a password */
  hasPassword: boolean;
  /** when the current invite or reset link stops working */
  linkExpiresAt: string | null;
  lastLoginAt: string | null;
}

export interface GarageBranchSummary {
  id: string;
  name: string;
  code: string;
  isMain: boolean;
  isActive: boolean;
}

/** POST /admin/v1/garages/:garageId/view-as: open this link within `expiresAt`. */
export interface ViewAsLink {
  /** garage-web's /view-as page, with the one-time code after `#` */
  url: string;
  expiresAt: string;
}

export interface SubscriptionPaymentItem {
  id: string;
  amountCents: number;
  method: SubscriptionPaymentMethod;
  /** YYYY-MM-DD */
  paidOn: string;
  /** YYYY-MM-DD: the paid period */
  periodStart: string;
  newExpiryDate: string;
  extraBranches: number;
  note: string | null;
  recordedBy: { id: string; name: string };
  createdAt: string;
}

export interface GarageDetail extends GarageListItem {
  locationText: string;
  timezone: string;
  defaultLocale: Locale;
  suspendedAt: string | null;
  suspendedReason: string | null;
  owner: GarageOwnerSummary | null;
  branches: GarageBranchSummary[];
  /** newest first */
  payments: SubscriptionPaymentItem[];
  /** suggested new expiry date for the next payment, YYYY-MM-DD */
  suggestedExpiry: string;
}
