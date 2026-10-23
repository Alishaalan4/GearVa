import { z } from 'zod';
import { paginationQuerySchema } from './pagination';
import { phoneSchema } from './phone';

// Admin garage management (flow.md 2.1, 11.1). Shared by the API and the admin web app.

export const GARAGE_STATUSES = ['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED'] as const;
export type GarageStatus = (typeof GARAGE_STATUSES)[number];

export const LOCALES = ['ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Free trial length until system settings exist (Phase 5: `trial.days`). */
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

export interface GarageDetail extends GarageListItem {
  locationText: string;
  timezone: string;
  defaultLocale: Locale;
  suspendedAt: string | null;
  suspendedReason: string | null;
  owner: GarageOwnerSummary | null;
  branches: GarageBranchSummary[];
}
