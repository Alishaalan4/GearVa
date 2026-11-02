import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INVOICE_NUMBER_FORMAT,
  discountCents,
  earliestNextDue,
  formatInvoiceNumber,
  invoicePaymentStatus,
  invoiceTotals,
  isValidInvoiceNumberFormat,
  vatCents,
  vatRateToHundredths,
} from '../src/invoices';

describe('discountCents (flow.md 7.4)', () => {
  it('no discount is 0', () => {
    expect(discountCents(1000, null)).toBe(0);
  });

  it('an amount comes off as it is, but never more than the subtotal', () => {
    expect(discountCents(1000, { type: 'AMOUNT', value: 250 })).toBe(250);
    expect(discountCents(1000, { type: 'AMOUNT', value: 1500 })).toBe(1000);
  });

  it('a percent rounds to the nearest cent, halves up', () => {
    expect(discountCents(1000, { type: 'PERCENT', value: 10 })).toBe(100);
    expect(discountCents(999, { type: 'PERCENT', value: 15 })).toBe(150); // 149.85
    expect(discountCents(50, { type: 'PERCENT', value: 25 })).toBe(13); // 12.5
    expect(discountCents(1000, { type: 'PERCENT', value: 100 })).toBe(1000);
    expect(discountCents(1000, { type: 'PERCENT', value: 0 })).toBe(0);
  });

  it('refuses a bad discount', () => {
    expect(() => discountCents(1000, { type: 'PERCENT', value: 101 })).toThrow();
    expect(() => discountCents(1000, { type: 'AMOUNT', value: -1 })).toThrow();
    expect(() => discountCents(1000, { type: 'AMOUNT', value: 1.5 })).toThrow();
    expect(() => discountCents(-1, null)).toThrow();
  });
});

describe('VAT', () => {
  it('reads a rate without floats', () => {
    expect(vatRateToHundredths('11')).toBe(1100);
    expect(vatRateToHundredths('11.5')).toBe(1150);
    expect(vatRateToHundredths('11.25')).toBe(1125);
    expect(vatRateToHundredths('0')).toBe(0);
  });

  it('refuses a bad rate', () => {
    for (const rate of ['abc', '11.255', '-1', '100.01', '']) {
      expect(() => vatRateToHundredths(rate), rate).toThrow();
    }
  });

  it('is 0 when VAT is off', () => {
    expect(vatCents(1000, null)).toBe(0);
  });

  it('rounds to the nearest cent, halves up', () => {
    expect(vatCents(1000, '11')).toBe(110);
    expect(vatCents(50, '11')).toBe(6); // 5.5
    expect(vatCents(1234, '11.25')).toBe(139); // 138.825
  });
});

describe('invoiceTotals', () => {
  it('adds the lines when there is no discount or VAT', () => {
    expect(
      invoiceTotals({ lineTotalsCents: [1000, 2550], discount: null, vatRatePercent: null }),
    ).toEqual({ subtotalCents: 3550, discountCents: 0, vatCents: 0, totalCents: 3550 });
  });

  it('charges VAT after the discount', () => {
    expect(
      invoiceTotals({
        lineTotalsCents: [10000],
        discount: { type: 'PERCENT', value: 10 },
        vatRatePercent: '11',
      }),
    ).toEqual({ subtotalCents: 10000, discountCents: 1000, vatCents: 990, totalCents: 9990 });
  });

  it('a full discount or free work totals 0', () => {
    expect(
      invoiceTotals({
        lineTotalsCents: [500],
        discount: { type: 'AMOUNT', value: 900 },
        vatRatePercent: '11',
      }).totalCents,
    ).toBe(0);
    expect(
      invoiceTotals({ lineTotalsCents: [0, 0], discount: null, vatRatePercent: null }).totalCents,
    ).toBe(0);
  });
});

describe('invoicePaymentStatus (flow.md 7.3)', () => {
  it('follows the amount paid', () => {
    expect(invoicePaymentStatus(1000, 0)).toBe('UNPAID');
    expect(invoicePaymentStatus(1000, 1)).toBe('PARTIALLY_PAID');
    expect(invoicePaymentStatus(1000, 999)).toBe('PARTIALLY_PAID');
    expect(invoicePaymentStatus(1000, 1000)).toBe('PAID');
  });

  it('a free invoice is paid from the start', () => {
    expect(invoicePaymentStatus(0, 0)).toBe('PAID');
  });

  it('refuses paying more than the total', () => {
    expect(() => invoicePaymentStatus(1000, 1001)).toThrow();
  });
});

describe('invoice numbers', () => {
  const parts = { branchCode: 'BR1', year: 2026, seq: 1 };

  it('fills the default format', () => {
    expect(formatInvoiceNumber(DEFAULT_INVOICE_NUMBER_FORMAT, parts)).toBe('BR1-2026-0001');
  });

  it('a sequence wider than the padding is not cut', () => {
    expect(formatInvoiceNumber(DEFAULT_INVOICE_NUMBER_FORMAT, { ...parts, seq: 12345 })).toBe(
      'BR1-2026-12345',
    );
  });

  it('a garage can change the order and padding', () => {
    expect(formatInvoiceNumber('INV/{YYYY}/{BRANCH}/{SEQ:6}', parts)).toBe('INV/2026/BR1/000001');
  });

  it('a format must hold the branch, year and sequence', () => {
    expect(isValidInvoiceNumberFormat(DEFAULT_INVOICE_NUMBER_FORMAT)).toBe(true);
    for (const format of [
      '{YYYY}-{SEQ:4}',
      '{BRANCH}-{SEQ:4}',
      '{BRANCH}-{YYYY}',
      '{BRANCH}-{YYYY}-{SEQ}',
      '{BRANCH}-{YYYY}-{SEQ:0}',
      '{BRANCH}-{YYYY}-{SEQ:4}-{CUSTOMER}',
    ]) {
      expect(isValidInvoiceNumberFormat(format), format).toBe(false);
    }
    expect(() => formatInvoiceNumber('{SEQ:4}', parts)).toThrow();
  });
});

describe('earliestNextDue', () => {
  it('takes the lowest km and the earliest date, each on its own', () => {
    expect(
      earliestNextDue([
        { nextDueKm: 90000, nextDueDate: '2027-05-01' },
        { nextDueKm: 65000, nextDueDate: null },
        { nextDueKm: null, nextDueDate: '2026-12-01' },
      ]),
    ).toEqual({ nextServiceKm: 65000, nextServiceDate: '2026-12-01' });
  });

  it('is empty when no service has a next due', () => {
    expect(earliestNextDue([{ nextDueKm: null, nextDueDate: null }])).toEqual({
      nextServiceKm: null,
      nextServiceDate: null,
    });
  });
});
