// Invoice calculations (flow.md 7.1, 7.3, 7.4). Everything is integer cents with halves
// rounding up, like line totals: no floating point ever touches an amount.
import { z } from 'zod';
import type { CustomerSummary } from './customers';
import type { DistanceUnit } from './distance';
import { quantityToHundredths } from './money';
import { paginationQuerySchema } from './pagination';

export const INVOICE_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = ['CASH', 'WHISH'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const DISCOUNT_TYPES = ['AMOUNT', 'PERCENT'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const DEFAULT_INVOICE_NUMBER_FORMAT = '{BRANCH}-{YYYY}-{SEQ:4}';

function requireCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a whole number of cents, 0 or more`);
  }
}

/** a x b / divisor in integers, halves going up. */
function mulDivRounded(a: number, b: number, divisor: number): number {
  const product = a * b;
  if (!Number.isSafeInteger(product)) throw new Error('Amount is too large');
  return Math.floor((product + Math.floor(divisor / 2)) / divisor);
}

export interface Discount {
  type: DiscountType;
  /** cents for AMOUNT; a whole percent, 0 to 100, for PERCENT */
  value: number;
}

/** The discount in cents. It never goes above the subtotal, so a total is never negative. */
export function discountCents(subtotalCents: number, discount: Discount | null): number {
  requireCents(subtotalCents, 'Subtotal');
  if (!discount) return 0;
  requireCents(discount.value, 'Discount');
  if (discount.type === 'AMOUNT') return Math.min(discount.value, subtotalCents);
  if (discount.value > 100) throw new Error('A percent discount cannot be more than 100');
  return mulDivRounded(subtotalCents, discount.value, 100);
}

/** A rate like "11", "11.5" or "11.25" as hundredths of a percent (1125), validated. */
export function vatRateToHundredths(rate: string): number {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(rate.trim());
  if (!match) throw new Error(`VAT rate must have at most 2 decimals: ${rate}`);
  const hundredths = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (hundredths > 10000) throw new Error('VAT rate cannot be more than 100');
  return hundredths;
}

/** VAT on an amount; `null` when the garage has VAT off. */
export function vatCents(taxableCents: number, vatRatePercent: string | null): number {
  requireCents(taxableCents, 'Taxable amount');
  if (vatRatePercent === null) return 0;
  return mulDivRounded(taxableCents, vatRateToHundredths(vatRatePercent), 10000);
}

export interface InvoiceTotals {
  subtotalCents: number;
  discountCents: number;
  vatCents: number;
  totalCents: number;
}

/** flow.md 7.1 step 4: VAT is charged on the amount after the discount. */
export function invoiceTotals(input: {
  lineTotalsCents: number[];
  discount: Discount | null;
  vatRatePercent: string | null;
}): InvoiceTotals {
  let subtotal = 0;
  for (const line of input.lineTotalsCents) {
    requireCents(line, 'Line total');
    subtotal += line;
  }
  if (!Number.isSafeInteger(subtotal)) throw new Error('Amount is too large');
  const discount = discountCents(subtotal, input.discount);
  const vat = vatCents(subtotal - discount, input.vatRatePercent);
  return {
    subtotalCents: subtotal,
    discountCents: discount,
    vatCents: vat,
    totalCents: subtotal - discount + vat,
  };
}

/**
 * The status for an amount paid so far (flow.md 7.3). A total of 0 is paid from the start:
 * it can never receive a payment, because a payment must be above 0.
 */
export function invoicePaymentStatus(
  totalCents: number,
  paidCents: number,
): Exclude<InvoiceStatus, 'CANCELLED'> {
  requireCents(totalCents, 'Total');
  requireCents(paidCents, 'Paid amount');
  if (paidCents > totalCents) throw new Error('Paid amount cannot be more than the total');
  if (paidCents === totalCents) return 'PAID';
  return paidCents > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

const cents = z.number().int().min(0).max(100_000_000);

const discountSchema = z
  .object({ type: z.enum(DISCOUNT_TYPES), value: cents })
  .refine((d) => d.type === 'AMOUNT' || d.value <= 100, {
    message: 'A percent discount cannot be more than 100',
  });

/** What "Finish visit" takes (flow.md 7.1). Staying without `payment` means pay later. */
export const finishOptions = {
  discount: discountSchema.nullable().optional(),
  /** a total of 0 needs this (decision 2026-11-02) */
  confirmFree: z.boolean().default(false),
  /** paid now; without `amountCents` the whole total is paid */
  payment: z
    .object({ method: z.enum(PAYMENT_METHODS), amountCents: cents.min(1).optional() })
    .nullable()
    .optional(),
};

export const finishVisitSchema = z.object(finishOptions).prefault({});
export type FinishVisitInput = z.infer<typeof finishVisitSchema>;

/** flow.md 8.1 */
export const recordPaymentSchema = z.object({
  amountCents: cents.min(1),
  method: z.enum(PAYMENT_METHODS),
  /** YYYY-MM-DD; left out = today */
  date: z.iso.date().optional(),
  note: z.string().trim().max(500).optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

/** flow.md 7.5: changes quantities, prices and the discount; null removes the discount. */
export const editInvoiceSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.uuid(),
        quantity: z
          .union([z.number(), z.string()])
          .refine(
            (q) => {
              try {
                quantityToHundredths(q);
                return true;
              } catch {
                return false;
              }
            },
            { message: 'More than 0, at most 2 decimals' },
          )
          .optional(),
        unitPriceCents: cents.optional(),
      }),
    )
    .max(50)
    .optional(),
  discount: discountSchema.nullable().optional(),
  confirmFree: z.boolean().default(false),
});
export type EditInvoiceInput = z.infer<typeof editInvoiceSchema>;

export const cancelInvoiceSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export type CancelInvoiceInput = z.infer<typeof cancelInvoiceSchema>;

export const invoiceListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(INVOICE_STATUSES).optional(),
  /** cancelled invoices that still hold money (flow.md 7.5) */
  refundNeeded: z.stringbool().optional(),
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export const incomeQuerySchema = z.object({
  /** owners and managers may choose; staff of one branch always get theirs */
  branchId: z.uuid().optional(),
});
export type IncomeQuery = z.infer<typeof incomeQuerySchema>;

/** Invoice logo: PNG or JPEG, because the file is shown back and printed. */
export const LOGO_MAX_BYTES = 1024 * 1024;

export const updateInvoiceSettingsSchema = z.object({
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  invoiceNumberFormat: z
    .string()
    .trim()
    .max(40)
    .refine((f) => isValidInvoiceNumberFormat(f), {
      message: 'Must hold {BRANCH}, {YYYY} and {SEQ:n}',
    })
    .optional(),
  termsText: z.string().trim().max(2000).nullable().optional(),
  vatEnabled: z.boolean().optional(),
  vatRatePercent: z
    .string()
    .refine(
      (rate) => {
        try {
          vatRateToHundredths(rate);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'A rate from 0 to 100, at most 2 decimals' },
    )
    .nullable()
    .optional(),
  vatNumber: z.string().trim().max(40).nullable().optional(),
});
export type UpdateInvoiceSettingsInput = z.infer<typeof updateInvoiceSettingsSchema>;

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export interface InvoiceSummary {
  id: string;
  number: string;
  status: InvoiceStatus;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
}

export interface InvoiceDetail extends InvoiceSummary {
  visitId: string;
  issuedAt: string;
  locale: string;
  subtotalCents: number;
  discountType: DiscountType | null;
  discountValue: number | null;
  discountCents: number;
  vatCents: number;
  laborCents: number | null;
  partsCents: number | null;
  nextServiceKm: number | null;
  nextServiceDate: string | null;
  warrantyText: string | null;
  terms: string | null;
  /** copies from the moment of issue: they never change with the customer or car */
  customer: { name: string; phone: string };
  vehicle: {
    plate: string;
    make: string;
    model: string;
    year: number | null;
    odometerKm: number;
    distanceUnit: DistanceUnit;
  };
  garage: {
    name: string;
    phone: string;
    location: string;
    branchName: string;
    branchCode: string;
    vatNumber: string | null;
    brandColor: string;
  };
  items: {
    id: string;
    description: string;
    brand: string | null;
    grade: string | null;
    /** e.g. "1.00", "4.50" */
    quantity: string;
    unitPriceCents: number;
    totalCents: number;
  }[];
  payments: {
    id: string;
    amountCents: number;
    method: PaymentMethod;
    paidAt: string;
    note: string | null;
    receivedBy: { id: string; name: string };
  }[];
  cancelledAt: string | null;
  cancelReason: string | null;
  replacesInvoiceId: string | null;
}

export interface InvoiceListItem extends InvoiceSummary {
  issuedAt: string;
  customerName: string;
  plate: string;
}

/** One customer on the debt list (flow.md 8.2). */
export interface DebtItem {
  customer: CustomerSummary;
  remainingCents: number;
  invoices: (InvoiceSummary & { issuedAt: string; plate: string })[];
}

export interface IncomePeriod {
  /** money that came in (`payments`) */
  receivedCents: number;
  /** invoices issued, without cancelled ones */
  invoicedCents: number;
}

/** flow.md 8.3 */
export interface IncomeSummary {
  /** today in the garage's timezone, YYYY-MM-DD */
  date: string;
  today: IncomePeriod;
  month: IncomePeriod;
  /** paid on invoices that were later cancelled */
  refundNeededCents: number;
}

export interface InvoiceSettings {
  brandColor: string;
  hasLogo: boolean;
  invoiceNumberFormat: string;
  termsText: string | null;
  vatEnabled: boolean;
  vatRatePercent: string | null;
  vatNumber: string | null;
}

// ---------------------------------------------------------------------------
// Invoice numbers
// ---------------------------------------------------------------------------

const SEQ_TOKEN = /\{SEQ:([1-9])\}/;

/**
 * A format must hold the branch, year and sequence. Without all three, two invoices could
 * get the same text, and the garage-wide unique number would refuse the second one.
 */
export function isValidInvoiceNumberFormat(format: string): boolean {
  return (
    format.includes('{BRANCH}') &&
    format.includes('{YYYY}') &&
    SEQ_TOKEN.test(format) &&
    format.replace('{BRANCH}', '').replace('{YYYY}', '').replace(SEQ_TOKEN, '').match(/[{}]/) ===
      null
  );
}

/** `{BRANCH}-{YYYY}-{SEQ:4}` -> `BR1-2026-0001`. A sequence wider than the padding stays whole. */
export function formatInvoiceNumber(
  format: string,
  parts: { branchCode: string; year: number; seq: number },
): string {
  if (!isValidInvoiceNumberFormat(format)) throw new Error(`Bad invoice number format: ${format}`);
  return format
    .replace('{BRANCH}', parts.branchCode)
    .replace('{YYYY}', String(parts.year))
    .replace(SEQ_TOKEN, (_, width: string) => String(parts.seq).padStart(Number(width), '0'));
}

/** The earliest next due of a visit's services, for the invoice (database.md 4.5). */
export function earliestNextDue(
  records: { nextDueKm: number | null; nextDueDate: string | null }[],
): { nextServiceKm: number | null; nextServiceDate: string | null } {
  let nextServiceKm: number | null = null;
  let nextServiceDate: string | null = null;
  for (const { nextDueKm, nextDueDate } of records) {
    if (nextDueKm !== null && (nextServiceKm === null || nextDueKm < nextServiceKm)) {
      nextServiceKm = nextDueKm;
    }
    // YYYY-MM-DD text sorts like the dates it holds.
    if (nextDueDate !== null && (nextServiceDate === null || nextDueDate < nextServiceDate)) {
      nextServiceDate = nextDueDate;
    }
  }
  return { nextServiceKm, nextServiceDate };
}
