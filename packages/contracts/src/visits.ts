import { z } from 'zod';
import type { CustomerSummary, VehicleItem } from './customers';
import { quantityToHundredths } from './money';
import type { OdometerCheck } from './odometer';

// Service types, quick entry, visits, service records and history (flow.md 4-6).
// Shared by the API and garage-web.

// ---------------------------------------------------------------------------
// Service types
// ---------------------------------------------------------------------------

export interface ServiceTypeItem {
  /** the garage's override row when it has one, else the global default */
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  defaultIntervalKm: number | null;
  defaultIntervalMi: number | null;
  defaultIntervalMonths: number | null;
  /** which `details` shape applies (oil, wheels, battery, brakes, ac); null = none */
  detailKey: string | null;
}

/** The type that needs a typed name (flow.md 4.1 step 2). */
export const OTHER_SERVICE_CODE = 'OTHER';

// ---------------------------------------------------------------------------
// Service-specific details (database.md 4.4). Every field is optional.
// ---------------------------------------------------------------------------

const label = z.string().trim().max(60).optional();

export const SERVICE_DETAIL_SCHEMAS = {
  oil: z.strictObject({
    brand: label,
    grade: label,
    filterBrand: label,
    liters: z.number().min(0).max(100).optional(),
    filterChanged: z.boolean().optional(),
  }),
  wheels: z.strictObject({
    tireBrand: label,
    tireSize: label,
    alignment: z.boolean().optional(),
    balancing: z.boolean().optional(),
    rotation: z.boolean().optional(),
  }),
  battery: z.strictObject({
    brand: label,
    amps: z.number().int().min(0).max(5000).optional(),
    warrantyMonths: z.number().int().min(0).max(120).optional(),
  }),
  brakes: z.strictObject({
    position: z.enum(['FRONT', 'REAR']).optional(),
    part: z.enum(['PADS', 'DISCS']).optional(),
    padBrand: label,
  }),
  ac: z.strictObject({
    gasRefill: z.boolean().optional(),
    filterChanged: z.boolean().optional(),
    compressor: z.boolean().optional(),
  }),
} as const;
export type ServiceDetailKey = keyof typeof SERVICE_DETAIL_SCHEMAS;

export function isServiceDetailKey(key: string | null): key is ServiceDetailKey {
  return key !== null && Object.hasOwn(SERVICE_DETAIL_SCHEMAS, key);
}

// ---------------------------------------------------------------------------
// Entering services
// ---------------------------------------------------------------------------

const isoDate = z.iso.date();

/** A confirmation for an unusual odometer (flow.md 5.3). */
export const ODOMETER_CONFIRMATIONS = ['CORRECTION', 'TYPO'] as const;

/** One service line (flow.md 4.1): only the type is required; price 0 is allowed (flow.md 13). */
export const serviceLineSchema = z.object({
  serviceTypeId: z.uuid(),
  /** required when the type is OTHER */
  customName: z.string().trim().min(2).max(120).optional(),
  /** at most 2 decimals, e.g. 4.5 litres */
  quantity: z
    .union([z.number(), z.string()])
    .default(1)
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
    ),
  unitPriceCents: z.number().int().min(0).max(100_000_000).default(0),
  laborCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  partsCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  notes: z.string().trim().max(1000).optional(),
  /** validated against the type's detailKey by the API */
  details: z.record(z.string(), z.unknown()).default({}),
  warrantyUntil: isoDate.nullable().optional(),
  recommendedNote: z.string().trim().max(500).optional(),
  recommendedAfterMonths: z.number().int().min(1).max(120).nullable().optional(),
  /**
   * flow.md 6: the mechanic may change the next due values. Left out = computed from the
   * interval; null = none. The odometer is in the car's unit.
   */
  nextDueOdometer: z.number().int().min(0).max(5_000_000).nullable().optional(),
  nextDueDate: isoDate.nullable().optional(),
});
export type ServiceLineInput = z.infer<typeof serviceLineSchema>;

const visitStart = {
  vehicleId: z.uuid(),
  /** in the car's unit */
  odometer: z.number().int().min(0).max(5_000_000),
  /** owners and managers may choose; staff of one branch always use theirs */
  branchId: z.uuid().optional(),
  /** repeats the check the API answered, to confirm an unusual reading */
  confirmOdometer: z.enum(ODOMETER_CONFIRMATIONS).optional(),
  notes: z.string().trim().max(1000).optional(),
};

/** flow.md 4.2: the visit, its records and reminders in one transaction. */
export const quickVisitSchema = z.object({
  ...visitStart,
  services: z.array(serviceLineSchema).min(1).max(20),
  /** close the visit (`DONE`); from Phase 3 this also issues the invoice */
  finish: z.boolean().default(true),
});
export type QuickVisitInput = z.infer<typeof quickVisitSchema>;

/** A longer job: opens an IN_PROGRESS visit with no records yet. */
export const openVisitSchema = z.object(visitStart);
export type OpenVisitInput = z.infer<typeof openVisitSchema>;

export const addRecordsSchema = z.object({
  services: z.array(serviceLineSchema).min(1).max(20),
});
export type AddRecordsInput = z.infer<typeof addRecordsSchema>;

/** DONE is reached only through "finish". */
export const updateVisitSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'WAITING_FOR_PARTS']).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type UpdateVisitInput = z.infer<typeof updateVisitSchema>;

/** details of 409 ODOMETER_CONFIRMATION_REQUIRED */
export interface OdometerConfirmationDetails {
  check: Exclude<OdometerCheck, 'OK'>;
  /** in km */
  previousKm: number;
  newKm: number;
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export const VISIT_STATUSES = ['IN_PROGRESS', 'WAITING_FOR_PARTS', 'DONE'] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export interface ServiceRecordItem {
  id: string;
  visitId: string;
  serviceType: Pick<ServiceTypeItem, 'id' | 'code' | 'nameEn' | 'nameAr'>;
  customName: string | null;
  performedAt: string;
  odometerKm: number;
  /** e.g. "1.00", "4.50" */
  quantity: string;
  unitPriceCents: number;
  totalCents: number;
  laborCents: number | null;
  partsCents: number | null;
  notes: string | null;
  details: Record<string, unknown>;
  warrantyUntil: string | null;
  recommendedNote: string | null;
  recommendedAfterMonths: number | null;
  nextDueKm: number | null;
  nextDueDate: string | null;
  mechanic: { id: string; name: string };
}

export interface VisitDetail {
  id: string;
  status: VisitStatus;
  branch: { id: string; code: string; name: string };
  vehicle: VehicleItem;
  customer: CustomerSummary;
  mechanic: { id: string; name: string };
  odometerKm: number;
  openedAt: string;
  finishedAt: string | null;
  notes: string | null;
  records: ServiceRecordItem[];
  /** sum of the records, in cents */
  totalCents: number;
}

/** One line of the service history timeline (flow.md 4, database.md 8). */
export interface HistoryItem extends ServiceRecordItem {
  visit: { id: string; status: VisitStatus; branchCode: string };
}

/** GET /v1/vehicles/:id/prefill?serviceTypeId= (flow.md 4.1 step 3). */
export const prefillQuerySchema = z.object({ serviceTypeId: z.uuid() });
export type PrefillQuery = z.infer<typeof prefillQuerySchema>;

export interface PrefillResponse {
  /** today's estimate, in km and in the car's unit */
  estimatedKm: number;
  estimatedOdometer: number;
  serviceType: ServiceTypeItem;
  /** "last used for this car": the latest record of the same service type */
  last: Pick<
    ServiceRecordItem,
    'performedAt' | 'odometerKm' | 'quantity' | 'unitPriceCents' | 'details' | 'customName'
  > | null;
  /** the next due values if the service is done today at the estimated km */
  nextDueKm: number | null;
  nextDueDate: string | null;
}
