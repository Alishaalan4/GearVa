import { describe, expect, it } from 'vitest';
import { suggestNewExpiry } from '../src/garages';

describe('suggestNewExpiry (flow.md 11.1)', () => {
  it('continues a paid period that has not ended', () => {
    expect(suggestNewExpiry('2027-03-01', '2026-11-09')).toBe('2028-03-01');
  });

  it('starts from today when the period ended, or there was none (a trial)', () => {
    expect(suggestNewExpiry('2026-10-01', '2026-11-09')).toBe('2027-11-09');
    expect(suggestNewExpiry(null, '2026-11-09')).toBe('2027-11-09');
  });

  it('keeps the last day of a month', () => {
    expect(suggestNewExpiry(null, '2028-02-29')).toBe('2029-02-28');
  });
});
