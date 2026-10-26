import { describe, expect, it } from 'vitest';
import { fromKm, kmToMiles, milesToKm, toKm } from '../src/distance';

describe('km and miles (flow.md 5.3)', () => {
  it('converts with 1 mi = 1.609344 km, rounded to whole units', () => {
    expect(milesToKm(1)).toBe(2);
    expect(milesToKm(3600)).toBe(5794); // 5793.64
    expect(milesToKm(3417)).toBe(5499); // 5499.13
    expect(kmToMiles(5000)).toBe(3107); // 3106.86
    expect(kmToMiles(0)).toBe(0);
  });

  it('gives the flow.md 6 example: 3,417 mi + 3,600 mi shows as 7,017 mi', () => {
    const nextKm = milesToKm(3417) + milesToKm(3600);
    expect(kmToMiles(nextKm)).toBe(7017);
  });

  it('toKm and fromKm respect the car unit', () => {
    expect(toKm(120000, 'KM')).toBe(120000);
    expect(toKm(100, 'MI')).toBe(161);
    expect(fromKm(161, 'MI')).toBe(100);
    expect(fromKm(161, 'KM')).toBe(161);
  });
});
