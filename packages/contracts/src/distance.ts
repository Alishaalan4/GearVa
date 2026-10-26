// Distance is stored in km; miles exist only at the display and entry edges
// (README 5.4, flow.md 5.3). Every conversion goes through these helpers.

export const DISTANCE_UNITS = ['KM', 'MI'] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

/** 1 mile = 1.609344 km (exact, international mile). */
export const KM_PER_MILE = 1.609344;

/** Whole km for a distance entered in miles: round(miles x 1.609344). */
export function milesToKm(miles: number): number {
  return Math.round(miles * KM_PER_MILE);
}

/** Whole miles to show for a distance stored in km: round(km / 1.609344). */
export function kmToMiles(km: number): number {
  return Math.round(km / KM_PER_MILE);
}

/** A value typed in the car's unit, as stored km. */
export function toKm(value: number, unit: DistanceUnit): number {
  return unit === 'MI' ? milesToKm(value) : Math.round(value);
}

/** Stored km, in the car's display unit. */
export function fromKm(km: number, unit: DistanceUnit): number {
  return unit === 'MI' ? kmToMiles(km) : Math.round(km);
}
