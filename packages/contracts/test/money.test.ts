import { describe, expect, it } from 'vitest';
import { centsToDecimal, dollarsToCents, lineTotalCents, quantityToHundredths } from '../src/money';

describe('lineTotalCents (quantity x unit price, integer cents)', () => {
  it('multiplies whole quantities exactly', () => {
    expect(lineTotalCents(1, 2500)).toBe(2500);
    expect(lineTotalCents(4, 1999)).toBe(7996);
    expect(lineTotalCents('3', 0)).toBe(0);
  });

  it('rounds to the nearest cent, halves up', () => {
    expect(lineTotalCents(1.5, 333)).toBe(500); // 499.5
    expect(lineTotalCents('1.25', 333)).toBe(416); // 416.25
    expect(lineTotalCents('0.75', 333)).toBe(250); // 249.75
    expect(lineTotalCents('0.01', 49)).toBe(0); // 0.49
    expect(lineTotalCents('0.01', 50)).toBe(1); // 0.5
  });

  it('never uses floating point: 4.35 litres at $1.10', () => {
    // In floating point 4.35 * 110 is 478.49999999999994, which would round down.
    expect(lineTotalCents(4.35, 110)).toBe(479); // exactly 478.5
  });

  it('refuses bad quantities and prices', () => {
    for (const bad of [0, -1, '1.005', 'abc', '', 1e21]) {
      expect(() => lineTotalCents(bad, 100), String(bad)).toThrow();
    }
    expect(() => lineTotalCents(1, 1.5)).toThrow();
    expect(() => lineTotalCents(1, -100)).toThrow();
  });

  it('reads quantities as hundredths', () => {
    expect(quantityToHundredths('2')).toBe(200);
    expect(quantityToHundredths('2.5')).toBe(250);
    expect(quantityToHundredths(0.05)).toBe(5);
  });
});

describe('typed dollars and cents, without floats', () => {
  it('reads dollars as text', () => {
    expect(dollarsToCents('200')).toBe(20_000);
    expect(dollarsToCents('45.5')).toBe(4550);
    expect(dollarsToCents('0,07')).toBe(7);
    expect(dollarsToCents('')).toBe(0);
    expect(dollarsToCents('12.345')).toBeNull();
    expect(dollarsToCents('-5')).toBeNull();
  });

  it('writes cents as exact decimal text', () => {
    expect(centsToDecimal(20_000)).toBe('200.00');
    expect(centsToDecimal(4507)).toBe('45.07');
    expect(centsToDecimal(-150)).toBe('-1.50');
  });
});
