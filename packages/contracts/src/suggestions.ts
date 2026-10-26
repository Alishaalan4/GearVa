import { z } from 'zod';

// Per-garage autocomplete (flow.md 4.3, database.md 4.4). Never shared between garages.

export const SUGGESTION_FIELDS = [
  'OIL_BRAND',
  'OIL_GRADE',
  'FILTER_BRAND',
  'BATTERY_BRAND',
  'TIRE_BRAND',
  'BRAKE_PAD_BRAND',
  'SERVICE_NAME',
  'VEHICLE_MAKE',
  'VEHICLE_MODEL',
] as const;
export type SuggestionField = (typeof SUGGESTION_FIELDS)[number];

/** How many suggestions one request returns, most used first. */
export const SUGGESTION_LIMIT = 10;

/** GET /v1/suggestions?field=OIL_BRAND&q=cas (q empty = the most used values). */
export const suggestionQuerySchema = z.object({
  field: z.enum(SUGGESTION_FIELDS),
  q: z.string().trim().max(60).default(''),
});
export type SuggestionQuery = z.infer<typeof suggestionQuerySchema>;

export interface SuggestionItem {
  /** display value, as first typed ("Castrol") */
  value: string;
  useCount: number;
}

export interface SuggestionList {
  items: SuggestionItem[];
}
