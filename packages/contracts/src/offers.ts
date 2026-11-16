import { z } from 'zod';
import { DISCOUNT_TYPES, type DiscountType } from './invoices';
import { paginationQuerySchema } from './pagination';

// Offers (flow.md 10; step 6.5): created by OWNER and MANAGER in the garage app, shown in
// the owner app. Targeting, broadcasts and picking an offer on an invoice are Phase 7.

/** An offer image: PNG or JPEG, like the garage logo. */
export const OFFER_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const offerFields = {
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().max(1000).default(''),
  discountType: z.enum(DISCOUNT_TYPES),
  /** AMOUNT: cents; PERCENT: 1 to 100 */
  discountValue: z.number().int().min(1).max(100_000_000),
  /** shown from (ISO); left out = now */
  startsAt: z.iso.datetime().optional(),
  /** null = no end */
  expiresAt: z.iso.datetime().nullable().optional(),
  isActive: z.boolean().optional(),
};

const percentOk = (v: { discountType?: DiscountType; discountValue?: number }) =>
  v.discountType !== 'PERCENT' || v.discountValue === undefined || v.discountValue <= 100;
const datesOk = (v: { startsAt?: string; expiresAt?: string | null }) =>
  !v.startsAt || !v.expiresAt || Date.parse(v.expiresAt) > Date.parse(v.startsAt);

export const createOfferSchema = z
  .object(offerFields)
  .refine(percentOk, { path: ['discountValue'], message: 'A percent is at most 100' })
  .refine(datesOk, { path: ['expiresAt'], message: 'The end must be after the start' });
export type CreateOfferInput = z.infer<typeof createOfferSchema>;

/** Every field optional; the API checks the result against the stored offer too. */
export const updateOfferSchema = z
  .object({ ...offerFields, body: z.string().trim().max(1000).optional() })
  .partial()
  .refine(percentOk, { path: ['discountValue'], message: 'A percent is at most 100' })
  .refine(datesOk, { path: ['expiresAt'], message: 'The end must be after the start' });
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;

export const offerListQuerySchema = paginationQuerySchema;
export type OfferListQuery = z.infer<typeof offerListQuerySchema>;

/**
 * What the owner app shows now: ACTIVE (on, started, not ended), SCHEDULED (on, starts
 * later), ENDED (past its end) or OFF (switched off by the garage).
 */
export const OFFER_STATES = ['ACTIVE', 'SCHEDULED', 'ENDED', 'OFF'] as const;
export type OfferState = (typeof OFFER_STATES)[number];

export function offerState(
  offer: { isActive: boolean; startsAt: string; expiresAt: string | null },
  now = new Date(),
): OfferState {
  if (!offer.isActive) return 'OFF';
  if (offer.expiresAt && Date.parse(offer.expiresAt) <= now.getTime()) return 'ENDED';
  if (Date.parse(offer.startsAt) > now.getTime()) return 'SCHEDULED';
  return 'ACTIVE';
}

export interface OfferItem {
  id: string;
  title: string;
  body: string;
  hasImage: boolean;
  discountType: DiscountType;
  discountValue: number;
  startsAt: string;
  expiresAt: string | null;
  isActive: boolean;
  state: OfferState;
  /** owner app users who opened it */
  viewCount: number;
  createdAt: string;
}

/** GET /mobile/v1/offers (mobile-api.md 7.1). */
export interface OwnerOffer {
  id: string;
  garage: { id: string; name: string };
  title: string;
  body: string;
  hasImage: boolean;
  discountType: DiscountType;
  discountValue: number;
  expiresAt: string | null;
}
