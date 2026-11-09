import { z } from 'zod';
import { type GarageStatus, type SubscriptionPaymentMethod, GARAGE_STATUSES } from './garages';
import { paginationQuerySchema } from './pagination';

// Admin monitoring and business view (flow.md 11.2, 11.5). Counts only: the admin never
// sees a garage's customers here (flow.md 12).

/** GET /admin/v1/monitoring/expiring: paid periods and trials ending soon (flow.md 11.2). */
export const expiringQuerySchema = z.object({
  /** paid garages whose period ends within this many days (about 3 weeks) */
  paidDays: z.coerce.number().int().min(1).max(365).default(21),
  /** trial garages whose trial ends within this many days */
  trialDays: z.coerce.number().int().min(1).max(90).default(7),
});
export type ExpiringQuery = z.infer<typeof expiringQuerySchema>;

/** Usage counts of one garage (flow.md 11.2). */
export interface GarageUsage {
  customers: number;
  vehicles: number;
  invoicesThisMonth: number;
  /** this month: automatic emails sent and failed, WhatsApp messages staff marked sent */
  emailsSent: number;
  emailsFailed: number;
  whatsappSent: number;
  lastLoginAt: string | null;
  /** the newest visit: daily use, even when nobody signs in again for weeks */
  lastVisitAt: string | null;
}

export interface MonitoredGarage {
  id: string;
  name: string;
  status: GarageStatus;
  isPaid: boolean;
  trialEndsAt: string | null;
  expiresAt: string | null;
  branchCount: number;
  usage: GarageUsage;
}

export interface ExpiringGarages {
  /** soonest first */
  paid: MonitoredGarage[];
  trials: MonitoredGarage[];
}

/** GET /admin/v1/monitoring/usage: every garage with its counts, paginated. */
export const usageQuerySchema = paginationQuerySchema.extend({
  /** matches the garage name, case-insensitive */
  q: z.string().trim().max(100).optional(),
  status: z.enum(GARAGE_STATUSES).optional(),
  paid: z.enum(['true', 'false']).optional(),
  /** only garages with no sign-in and no visit for this many days (flow.md 11.2) */
  inactiveDays: z.coerce.number().int().min(1).max(3650).optional(),
});
export type UsageQuery = z.infer<typeof usageQuerySchema>;

/** GET /admin/v1/monitoring/failures: messages that failed, newest first. */
export const failuresQuerySchema = paginationQuerySchema.extend({
  garageId: z.uuid().optional(),
});
export type FailuresQuery = z.infer<typeof failuresQuerySchema>;

/** A failed message, without its recipient or content: those belong to the garage. */
export interface FailedMessage {
  id: string;
  garage: { id: string; name: string };
  type: string;
  channel: string;
  error: string | null;
  createdAt: string;
}

/** GET /admin/v1/business: subscription revenue and growth (flow.md 11.5). */
export interface BusinessView {
  /** the last 12 calendar months (UTC), oldest first */
  months: {
    /** YYYY-MM */
    month: string;
    revenueCents: number;
    payments: number;
    newGarages: number;
  }[];
  revenueThisYearCents: number;
  revenueLastYearCents: number;
  byStatus: Record<GarageStatus, number>;
  /** garages that have paid at least once, and those that never have */
  paid: number;
  unpaid: number;
  /** this year's revenue by payment method, cents */
  byMethod: Record<SubscriptionPaymentMethod, number>;
}
