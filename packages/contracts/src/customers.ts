import { z } from 'zod';
import { DISTANCE_UNITS, type DistanceUnit } from './distance';
import { paginationQuerySchema } from './pagination';
import { phoneSchema } from './phone';
import { normalizePlate } from './text-normalize';

// Customers, vehicles and search (flow.md 3). Shared by the API and garage-web.

const optionalNotes = z
  .string()
  .trim()
  .max(1000)
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

/** flow.md 3.1: name and phone. The phone is stored in E.164 on the global owner. */
export const createCustomerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  notes: optionalNotes,
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

/** The garage's own data about the customer. The phone (the owner's identity) is fixed. */
export const updateCustomerSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  notes: optionalNotes,
  remindersOptOut: z.boolean().optional(),
  marketingOptOut: z.boolean().optional(),
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export interface CustomerSummary {
  id: string;
  /** the garage's own name for the customer */
  name: string;
  /** E.164 */
  phone: string;
}

export interface CustomerDetail extends CustomerSummary {
  notes: string | null;
  remindersOptOut: boolean;
  marketingOptOut: boolean;
  createdAt: string;
  vehicles: VehicleItem[];
}

/** POST /v1/customers: a phone this garage already has returns that customer (flow.md 13). */
export interface CreateCustomerResponse extends CustomerDetail {
  created: boolean;
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear();

const plate = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .refine((v) => normalizePlate(v).length > 0, { message: 'Enter a plate' });

/** Make and model are free text with autocomplete from suggestions (flow.md 4.3). */
const vehicleText = z.string().trim().min(1).max(60);

/** flow.md 3.2: the odometer is entered in the car's unit and stored in km. */
export const createVehicleSchema = z.object({
  plate,
  make: vehicleText,
  model: vehicleText,
  year: z
    .number()
    .int()
    .min(1950)
    .max(CURRENT_YEAR + 1)
    .nullable()
    .optional(),
  distanceUnit: z.enum(DISTANCE_UNITS),
  /** in distanceUnit */
  odometer: z.number().int().min(0).max(3_000_000),
  notes: optionalNotes,
});
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

/** The odometer changes only through visits (step 2.4), never by editing the car. */
export const updateVehicleSchema = createVehicleSchema
  .omit({ odometer: true })
  .partial()
  .extend({ notes: optionalNotes });
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

export interface VehicleItem {
  id: string;
  /** as typed */
  plate: string;
  make: string;
  model: string;
  year: number | null;
  distanceUnit: DistanceUnit;
  /** last recorded odometer, in km (convert with fromKm for display) */
  currentKm: number;
}

export interface VehicleDetail extends VehicleItem {
  notes: string | null;
  lastOdometerAt: string | null;
  /** km per day from the history, null until there are 2 readings */
  avgDailyKm: number | null;
  /** today's estimate in km (flow.md 5.2), for quick entry */
  estimatedKm: number;
  customer: CustomerSummary;
  createdAt: string;
}

/** details of 409 VEHICLE_PLATE_EXISTS: the car that already has this plate. */
export interface PlateExistsDetails {
  vehicle: VehicleItem;
  customer: CustomerSummary;
}

// ---------------------------------------------------------------------------
// Search (flow.md 3.3)
// ---------------------------------------------------------------------------

/** One box for a plate or a phone number. */
export const searchQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(2).max(40),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

/**
 * One row per car. A phone match lists every car of that customer; a matching customer
 * without a car comes back once with `vehicle: null`, so staff can add one.
 */
export interface SearchResult {
  customer: CustomerSummary;
  vehicle: VehicleItem | null;
}
