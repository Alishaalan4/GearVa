import { z } from 'zod';
import { paginationQuerySchema } from './pagination';
import { phoneSchema } from './phone';

// Applications from the public website (flow.md 11.6, database.md `garage_applications`).

export const APPLICATION_STATUSES = ['NEW', 'APPROVED', 'REJECTED'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Most branches an application can ask for (the table's check). */
export const APPLICATION_MAX_BRANCHES = 50;

/** POST /v1/public/applications: the website's Apply form. No account is created. */
export const applySchema = z.object({
  garageName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  phone: phoneSchema,
  /** city or area */
  city: z.string().trim().min(2).max(120),
  branchCount: z.number().int().min(1).max(APPLICATION_MAX_BRANCHES),
  message: z
    .string()
    .trim()
    .max(1000)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  /**
   * The honeypot: hidden from people, so only a bot fills it in. An application with it
   * filled in gets the same answer and is not stored.
   */
  website: z.string().max(500).optional(),
});
export type ApplyInput = z.input<typeof applySchema>;

/** GET /v1/public/pricing: what the website shows (the admin's system settings). */
export interface PublicPricing {
  yearPriceCents: number;
  extraBranchPriceCents: number;
  trialDays: number;
}

export const applicationListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(APPLICATION_STATUSES).optional(),
  /** Matches garage name, owner name, email or phone, case-insensitive. */
  q: z.string().trim().max(100).optional(),
});
export type ApplicationListQuery = z.infer<typeof applicationListQuerySchema>;

/** POST /admin/v1/applications/:id/reject */
export const rejectApplicationSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type RejectApplicationInput = z.infer<typeof rejectApplicationSchema>;

export interface ApplicationListItem {
  id: string;
  garageName: string;
  ownerName: string;
  email: string;
  phone: string;
  city: string;
  branchCount: number;
  status: ApplicationStatus;
  createdAt: string;
}

export interface ApplicationDetail extends ApplicationListItem {
  message: string | null;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  /** the garage created on approval */
  garageId: string | null;
  /** other applications with the same email or phone, newest first (flow.md 11.6 item 3) */
  earlier: ApplicationListItem[];
}
