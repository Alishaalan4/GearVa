import { z } from 'zod';
import type { DistanceUnit } from './distance';
import { LOCALES, type Locale } from './garages';
import { INVOICE_STATUSES, type InvoiceStatus, type PaymentMethod } from './invoices';
import { paginationQuerySchema } from './pagination';
import type { NextServiceStatus } from './reminders';
import { PASSWORD_MIN_LENGTH, type SetPasswordInput, setPasswordSchema } from './staff';

// Car owners and the owner app (V3, flow.md 2.4, docs/mobile-api.md).

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const newPassword = z.string().min(PASSWORD_MIN_LENGTH).max(200);
const anyPassword = z.string().min(1).max(200);
const refreshToken = z.string().min(20).max(200);

/**
 * POST /mobile/v1/auth/set-password: the web page behind the owner's invite and reset
 * links (gearva.online/owner/set-password?token=...). Same rule as staff: 10+ characters.
 */
export const ownerSetPasswordSchema = setPasswordSchema;
export type OwnerSetPasswordInput = SetPasswordInput;

export interface OwnerSetPasswordResponse {
  /** the login email to type in the app */
  email: string;
}

// ---------------------------------------------------------------------------
// Auth (mobile-api.md 2)
// ---------------------------------------------------------------------------

export const ownerLoginSchema = z.object({ email, password: anyPassword });
export type OwnerLoginInput = z.infer<typeof ownerLoginSchema>;

/** refresh and logout send the refresh token in the body (a phone has no cookies). */
export const ownerRefreshSchema = z.object({ refreshToken });
export type OwnerRefreshInput = z.infer<typeof ownerRefreshSchema>;

export const ownerForgotPasswordSchema = z.object({ email });
export type OwnerForgotPasswordInput = z.infer<typeof ownerForgotPasswordSchema>;

export interface OwnerAccount {
  id: string;
  name: string;
  email: string;
  locale: Locale;
}

/** The answer of login and refresh. */
export interface OwnerAuthResponse {
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  owner: OwnerAccount;
}

// ---------------------------------------------------------------------------
// Profile (mobile-api.md 3)
// ---------------------------------------------------------------------------

/** One garage where the owner is a customer, with their preferences there. */
export interface OwnerGarage {
  id: string;
  name: string;
  phone: string;
  locationText: string;
  hasLogo: boolean;
  remindersOptOut: boolean;
  marketingOptOut: boolean;
}

export interface OwnerProfile extends OwnerAccount {
  /** E.164 */
  phone: string;
  unreadNotifications: number;
  garages: OwnerGarage[];
}

export const updateOwnerProfileSchema = z.object({ locale: z.enum(LOCALES) });
export type UpdateOwnerProfileInput = z.infer<typeof updateOwnerProfileSchema>;

export const ownerPreferencesSchema = z
  .object({ remindersOptOut: z.boolean().optional(), marketingOptOut: z.boolean().optional() })
  .refine((v) => v.remindersOptOut !== undefined || v.marketingOptOut !== undefined, {
    message: 'Send remindersOptOut or marketingOptOut',
  });
export type OwnerPreferencesInput = z.infer<typeof ownerPreferencesSchema>;

export const ownerChangePasswordSchema = z.object({
  currentPassword: anyPassword,
  newPassword,
});
export type OwnerChangePasswordInput = z.infer<typeof ownerChangePasswordSchema>;

export const ownerDeleteAccountSchema = z.object({ password: anyPassword });
export type OwnerDeleteAccountInput = z.infer<typeof ownerDeleteAccountSchema>;

// ---------------------------------------------------------------------------
// Cars, history, invoices (mobile-api.md 4, 5; step 6.3)
// ---------------------------------------------------------------------------

/** Which garage a car, visit or invoice belongs to (mobile-api.md 1.3). */
export interface OwnerGarageRef {
  id: string;
  name: string;
}

export interface OwnerUpcomingService {
  /** in the request's language */
  serviceName: string;
  /** km; null for a date-only reminder (warranty end, a recommendation) */
  dueKm: number | null;
  /** YYYY-MM-DD */
  dueDate: string | null;
  status: NextServiceStatus;
}

export interface OwnerVehicle {
  id: string;
  garage: OwnerGarageRef;
  plate: string;
  make: string;
  model: string;
  year: number | null;
  distanceUnit: DistanceUnit;
  /** km at the last visit */
  lastRecordedKm: number;
  lastRecordedAt: string | null;
  /** today's estimate in km (flow.md 5.2) */
  estimatedKm: number;
  /** the soonest upcoming service, or null */
  nextService: OwnerUpcomingService | null;
}

export interface OwnerVehicleDetail extends OwnerVehicle {
  /** every open reminder of the car, soonest first */
  upcoming: OwnerUpcomingService[];
}

export interface OwnerServiceDetail {
  label: string;
  value: string;
}

export interface OwnerServiceItem {
  serviceName: string;
  details: OwnerServiceDetail[];
  notes: string | null;
  /** YYYY-MM-DD */
  warrantyUntil: string | null;
  recommendation: string | null;
  nextDueKm: number | null;
  /** YYYY-MM-DD */
  nextDueDate: string | null;
}

export interface OwnerVisit {
  id: string;
  /** when the visit finished, or opened if still in progress */
  date: string;
  odometerKm: number;
  garage: OwnerGarageRef;
  branchName: string;
  services: OwnerServiceItem[];
  /** null while the visit is in progress */
  invoice: { id: string; number: string; totalCents: number; status: InvoiceStatus } | null;
}

export const ownerVisitsQuerySchema = paginationQuerySchema;
export type OwnerVisitsQuery = z.infer<typeof ownerVisitsQuerySchema>;

export const ownerInvoicesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(INVOICE_STATUSES).optional(),
});
export type OwnerInvoicesQuery = z.infer<typeof ownerInvoicesQuerySchema>;

export interface OwnerInvoiceItem {
  id: string;
  number: string;
  issuedAt: string;
  garage: OwnerGarageRef;
  vehicle: { id: string; plate: string; make: string; model: string };
  status: InvoiceStatus;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
}

export interface OwnerInvoiceDetail extends OwnerInvoiceItem {
  items: {
    description: string;
    brand: string | null;
    grade: string | null;
    /** a decimal string ("1", "2.5"), exact */
    quantity: string;
    unitPriceCents: number;
    totalCents: number;
  }[];
  subtotalCents: number;
  discountCents: number;
  vatCents: number;
  payments: { amountCents: number; method: PaymentMethod; paidAt: string }[];
  nextServiceKm: number | null;
  /** YYYY-MM-DD */
  nextServiceDate: string | null;
  warrantyText: string | null;
  cancelReason: string | null;
}

// ---------------------------------------------------------------------------
// Inbox and push devices (mobile-api.md 6; step 6.4)
// ---------------------------------------------------------------------------

/** What the app opens when a notification is tapped. */
export const OWNER_NOTIFICATION_REFS = ['vehicle', 'invoice', 'offer'] as const;
export type OwnerNotificationRef = (typeof OWNER_NOTIFICATION_REFS)[number];

export interface OwnerNotification {
  id: string;
  /** SERVICE_REMINDER, WARRANTY_END, INVOICE, ...: unknown future types must still show */
  type: string;
  /** in the owner's language */
  title: string;
  body: string;
  garage: OwnerGarageRef;
  ref: { type: OwnerNotificationRef; id: string } | null;
  createdAt: string;
  readAt: string | null;
}

export const ownerNotificationsQuerySchema = paginationQuerySchema;
export type OwnerNotificationsQuery = z.infer<typeof ownerNotificationsQuerySchema>;

export const DEVICE_PLATFORMS = ['android', 'ios'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

/** POST /mobile/v1/devices: the FCM registration token of this phone. */
export const registerDeviceSchema = z.object({
  token: z.string().trim().min(10).max(4096),
  platform: z.enum(DEVICE_PLATFORMS),
});
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
