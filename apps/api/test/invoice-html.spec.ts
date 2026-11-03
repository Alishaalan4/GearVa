// The invoice template on its own (flow.md 7.2): no database, no browser.
import type { InvoiceDetail } from '@gearva/contracts';
import { escapeHtml, renderInvoiceHtml } from '../src/invoices/pdf/invoice-html';

const invoice = (over: Partial<InvoiceDetail> = {}): InvoiceDetail => ({
  id: 'i1',
  number: 'BR1-2026-0007',
  status: 'PARTIALLY_PAID',
  totalCents: 123450,
  paidCents: 3000,
  remainingCents: 120450,
  visitId: 'v1',
  issuedAt: '2026-11-02T10:00:00.000Z',
  locale: 'en',
  subtotalCents: 125000,
  discountType: 'AMOUNT',
  discountValue: 1550,
  discountCents: 1550,
  vatCents: 0,
  laborCents: 1000,
  partsCents: 2000,
  nextServiceKm: 90500,
  nextServiceDate: '2027-05-02',
  warrantyText: null,
  terms: 'Parts: 30 days.',
  customer: { name: 'Karim Haddad', phone: '+96170123456' },
  vehicle: {
    plate: 'B 123456',
    make: 'Toyota',
    model: 'Corolla',
    year: 2020,
    odometerKm: 85500,
    distanceUnit: 'KM',
  },
  garage: {
    name: 'Star Garage',
    phone: '+9611000000',
    location: 'Beirut',
    branchName: 'Main',
    branchCode: 'BR1',
    vatNumber: null,
    brandColor: '#111827',
  },
  items: [
    {
      id: 'l1',
      description: 'Oil change',
      serviceName: null,
      brand: 'Total',
      grade: '10W-40',
      quantity: '4.50',
      unitPriceCents: 1250,
      totalCents: 5625,
    },
  ],
  payments: [
    {
      id: 'p1',
      amountCents: 3000,
      method: 'WHISH',
      paidAt: '2026-11-02T10:00:00.000Z',
      note: null,
      receivedBy: { id: 's1', name: 'Staff' },
    },
  ],
  cancelledAt: null,
  cancelReason: null,
  replacesInvoiceId: null,
  ...over,
});

const html = (over: Partial<InvoiceDetail> = {}) =>
  renderInvoiceHtml({ invoice: invoice(over), logoDataUrl: null, fontCss: '' });

describe('invoice template', () => {
  it('prints what flow.md 7.2 lists', () => {
    const page = html();
    for (const text of [
      'BR1-2026-0007',
      'Star Garage',
      'Karim Haddad',
      'B 123456',
      'Toyota Corolla 2020',
      '85,500 km',
      'Oil change',
      'Total · 10W-40',
      '4.5',
      '$12.50',
      '$1,234.50',
      '$15.50',
      '$1,204.50',
      'Whish',
      'Labour: $10.00',
      '90,500 km · 2 May 2027',
      'Parts: 30 days.',
      'Powered by Gearva',
    ]) {
      expect(page).toContain(text);
    }
  });

  it('English is left to right; Arabic is right to left with Western digits', () => {
    expect(html()).toContain('<html lang="en" dir="ltr">');
    const page = html({ locale: 'ar' });
    expect(page).toContain('<html lang="ar" dir="rtl">');
    expect(page).toContain('فاتورة');
    // No left-to-right wrapper here: it would print the unit before the number.
    expect(page).toContain(': 85,500 كم</div>');
    expect(page).toMatch(/2 .+ 2027/);
  });

  it('shows miles for a car on miles', () => {
    const vehicle = { ...invoice().vehicle, distanceUnit: 'MI' as const };
    expect(html({ vehicle })).toContain('53,127 mi');
  });

  it('marks a cancelled invoice with its reason', () => {
    const page = html({ status: 'CANCELLED', cancelReason: 'Wrong car' });
    expect(page).toContain('Cancelled');
    expect(page).toContain('Wrong car');
  });

  it('leaves out lines with nothing to say', () => {
    const page = html({ discountCents: 0, paidCents: 0, remainingCents: 0, payments: [] });
    expect(page).not.toContain('Discount');
    expect(page).not.toContain('Remaining');
    expect(page).not.toContain('Payments');
  });

  it('text from people cannot become HTML', () => {
    expect(escapeHtml(`<b a="1">'&`)).toBe('&lt;b a=&quot;1&quot;&gt;&#39;&amp;');
    const customer = { name: '<script>alert(1)</script>', phone: '1' };
    const page = html({ customer, terms: '<img src=x>', cancelReason: '<i>' });
    expect(page).not.toContain('<script>alert');
    expect(page).not.toContain('<img src=x>');
  });
});
