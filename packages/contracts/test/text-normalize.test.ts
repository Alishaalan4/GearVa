import { describe, expect, it } from 'vitest';
import { normalizePlate, normalizeSuggestion } from '../src/text-normalize';

describe('normalizePlate', () => {
  it('uppercases and removes spaces and dashes', () => {
    expect(normalizePlate('b 123-456')).toBe('B123456');
    expect(normalizePlate('  B123456 ')).toBe('B123456');
    expect(normalizePlate('M – 98 76')).toBe('M9876');
  });

  it('turns Arabic-Indic and Persian digits into ASCII digits', () => {
    expect(normalizePlate('ب ١٢٣')).toBe('ب123');
    expect(normalizePlate('۱۲۳')).toBe('123');
  });
});

describe('normalizeSuggestion', () => {
  it('makes "Castrol", " castrol " and "CASTROL" one value', () => {
    expect(normalizeSuggestion('Castrol')).toBe('castrol');
    expect(normalizeSuggestion('  castrol ')).toBe('castrol');
    expect(normalizeSuggestion('CASTROL')).toBe('castrol');
  });

  it('collapses inner spaces', () => {
    expect(normalizeSuggestion(' Total   Quartz  9000 ')).toBe('total quartz 9000');
  });
});
