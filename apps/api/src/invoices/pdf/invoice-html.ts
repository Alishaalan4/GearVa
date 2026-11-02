import { type InvoiceDetail, fromKm } from '@gearva/contracts';

// The invoice as one HTML document (flow.md 7.2), in the customer's language. Pure: no
// database and no browser, so its content can be tested directly.

const LABELS = {
  en: {
    invoice: 'Invoice',
    customer: 'Customer',
    car: 'Car',
    odometer: 'Odometer',
    service: 'Service',
    quantity: 'Qty',
    unitPrice: 'Unit price',
    total: 'Total',
    subtotal: 'Subtotal',
    discount: 'Discount',
    vat: 'VAT',
    vatNumber: 'VAT no.',
    paid: 'Paid',
    remaining: 'Remaining',
    labor: 'Labour',
    parts: 'Parts',
    payments: 'Payments',
    nextService: 'Next service',
    warranty: 'Warranty',
    terms: 'Terms',
    branch: 'Branch',
    km: 'km',
    mi: 'mi',
    CASH: 'Cash',
    WHISH: 'Whish',
    UNPAID: 'Unpaid',
    PARTIALLY_PAID: 'Partly paid',
    PAID: 'Paid',
    CANCELLED: 'Cancelled',
    cancelReason: 'Reason',
    replaces: 'Replaces a cancelled invoice',
  },
  ar: {
    invoice: 'فاتورة',
    customer: 'الزبون',
    car: 'السيارة',
    odometer: 'عداد المسافة',
    service: 'الخدمة',
    quantity: 'الكمية',
    unitPrice: 'سعر الوحدة',
    total: 'المجموع',
    subtotal: 'المجموع الفرعي',
    discount: 'الحسم',
    vat: 'الضريبة',
    vatNumber: 'الرقم الضريبي',
    paid: 'المدفوع',
    remaining: 'المتبقي',
    labor: 'اليد العاملة',
    parts: 'القطع',
    payments: 'الدفعات',
    nextService: 'الخدمة القادمة',
    warranty: 'الكفالة',
    terms: 'الشروط',
    branch: 'الفرع',
    km: 'كم',
    mi: 'ميل',
    CASH: 'نقدًا',
    WHISH: 'Whish',
    UNPAID: 'غير مدفوعة',
    PARTIALLY_PAID: 'مدفوعة جزئيًا',
    PAID: 'مدفوعة',
    CANCELLED: 'ملغاة',
    cancelReason: 'السبب',
    replaces: 'تحل محل فاتورة ملغاة',
  },
} as const;

/** Everything that comes from people goes through this. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Cents as text, with no float: 1250 -> $12.50. */
function money(cents: number): string {
  const whole = Math.floor(cents / 100).toLocaleString('en-US');
  return `$${whole}.${String(cents % 100).padStart(2, '0')}`;
}

export interface InvoiceHtmlInput {
  invoice: InvoiceDetail;
  /** a `data:` URL, so the page needs no network */
  logoDataUrl: string | null;
  /** @font-face rules, with the fonts embedded */
  fontCss: string;
}

export function renderInvoiceHtml({ invoice, logoDataUrl, fontCss }: InvoiceHtmlInput): string {
  const locale = invoice.locale === 'en' ? 'en' : 'ar';
  const t = LABELS[locale];
  const e = escapeHtml;
  // Western digits in Arabic too: Lebanon uses them on invoices.
  const dateFormat = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const day = (iso: string) => dateFormat.format(new Date(iso));
  const unit = invoice.vehicle.distanceUnit;
  const distance = (km: number) =>
    `${fromKm(km, unit).toLocaleString('en-US')} ${unit === 'MI' ? t.mi : t.km}`;
  const { customer, vehicle, garage } = invoice;

  const rows = invoice.items
    .map((item) => {
      const detail = [item.brand, item.grade].filter(Boolean).join(' · ');
      return `<tr>
        <td><b>${e(item.description)}</b>${detail ? `<small>${e(detail)}</small>` : ''}</td>
        <td class="num">${Number(item.quantity)}</td>
        <td class="num">${money(item.unitPriceCents)}</td>
        <td class="num">${money(item.totalCents)}</td>
      </tr>`;
    })
    .join('');

  const totalRow = (label: string, cents: number, strong = false) =>
    `<div class="row${strong ? ' strong' : ''}"><span>${label}</span><b>${money(cents)}</b></div>`;
  const totals = [
    invoice.discountCents > 0 || invoice.vatCents > 0
      ? totalRow(t.subtotal, invoice.subtotalCents)
      : '',
    invoice.discountCents > 0 ? totalRow(t.discount, invoice.discountCents) : '',
    invoice.vatCents > 0 ? totalRow(t.vat, invoice.vatCents) : '',
    totalRow(t.total, invoice.totalCents, true),
    invoice.paidCents > 0 ? totalRow(t.paid, invoice.paidCents) : '',
    invoice.remainingCents > 0 ? totalRow(t.remaining, invoice.remainingCents) : '',
  ].join('');

  const split = [
    invoice.laborCents !== null ? `${t.labor}: ${money(invoice.laborCents)}` : null,
    invoice.partsCents !== null ? `${t.parts}: ${money(invoice.partsCents)}` : null,
  ].filter(Boolean);

  const payments = invoice.payments
    .map(
      (p) =>
        `<li>${day(p.paidAt)} · ${t[p.method]} · <span dir="ltr">${money(p.amountCents)}</span></li>`,
    )
    .join('');

  const next = [
    invoice.nextServiceKm !== null ? distance(invoice.nextServiceKm) : null,
    invoice.nextServiceDate ? day(invoice.nextServiceDate) : null,
  ].filter(Boolean);

  const carText = [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ');

  return `<!doctype html>
<html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<style>
${fontCss}
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #101a19; font: 13px/1.45 'Plus Jakarta Sans', 'IBM Plex Sans Arabic', sans-serif; }
header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 14px; border-bottom: 3px solid ${e(garage.brandColor)}; }
header img { max-height: 64px; max-width: 180px; display: block; margin-bottom: 8px; }
h1 { margin: 0 0 4px; font-size: 26px; }
h2 { margin: 0; font-size: 17px; }
small { display: block; color: #55605e; font-size: 11px; }
.end { text-align: end; }
.status { display: inline-block; margin-top: 6px; padding: 2px 10px; border-radius: 10px; background: #eceae5; font-weight: 700; font-size: 11px; }
.status.CANCELLED { background: #fde3dd; color: #8a1f0e; }
.status.PAID { background: #ddf3e4; color: #14612f; }
.cancelled { margin-top: 12px; padding: 8px 12px; border-radius: 8px; background: #fde3dd; color: #8a1f0e; font-weight: 700; }
.parties { display: flex; gap: 32px; margin: 16px 0; }
.parties > div { flex: 1; }
.label { color: #55605e; font-size: 11px; }
table { width: 100%; border-collapse: collapse; }
th { padding: 6px 8px; text-align: start; color: #55605e; font-size: 11px; border-bottom: 1px solid #ddd8d0; }
td { padding: 8px; border-bottom: 1px solid #ddd8d0; vertical-align: top; }
.num { text-align: end; white-space: nowrap; unicode-bidi: isolate; }
tr { break-inside: avoid; }
.totals { width: 260px; margin-top: 12px; margin-inline-start: auto; }
.row { display: flex; justify-content: space-between; padding: 3px 8px; }
.row b { unicode-bidi: isolate; direction: ltr; }
.row.strong { margin: 4px 0; padding: 8px; border-radius: 8px; background: #101a19; color: #fff; font-size: 15px; }
.next { margin-top: 16px; padding: 10px 12px; border-radius: 8px; background: #ffede1; font-weight: 700; }
.note { margin-top: 12px; white-space: pre-line; }
ul { margin: 2px 0 0; padding: 0; list-style: none; }
footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #ddd8d0; text-align: center; color: #55605e; font-size: 10px; }
</style>
</head>
<body>
<header>
  <div>
    ${logoDataUrl ? `<img src="${e(logoDataUrl)}" alt="">` : ''}
    <h2>${e(garage.name)}</h2>
    <small>${e(garage.location)}</small>
    <small><span dir="ltr">${e(garage.phone)}</span></small>
    <small>${t.branch}: ${e(garage.branchName)}</small>
    ${garage.vatNumber ? `<small>${t.vatNumber}: ${e(garage.vatNumber)}</small>` : ''}
  </div>
  <div class="end">
    <h1>${t.invoice}</h1>
    <div><b dir="ltr">${e(invoice.number)}</b></div>
    <div>${day(invoice.issuedAt)}</div>
    <span class="status ${invoice.status}">${t[invoice.status]}</span>
  </div>
</header>
${invoice.status === 'CANCELLED' ? `<div class="cancelled">${t.CANCELLED}${invoice.cancelReason ? ` · ${t.cancelReason}: ${e(invoice.cancelReason)}` : ''}</div>` : ''}
<section class="parties">
  <div>
    <div class="label">${t.customer}</div>
    <b>${e(customer.name)}</b>
    <div><span dir="ltr">${e(customer.phone)}</span></div>
  </div>
  <div>
    <div class="label">${t.car}</div>
    <b dir="ltr">${e(vehicle.plate)}</b>
    <div>${e(carText)}</div>
    <div>${t.odometer}: ${distance(vehicle.odometerKm)}</div>
  </div>
</section>
<table>
  <thead><tr>
    <th>${t.service}</th>
    <th class="num">${t.quantity}</th>
    <th class="num">${t.unitPrice}</th>
    <th class="num">${t.total}</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="totals">${totals}</div>
${split.length > 0 ? `<p class="note">${split.join(' · ')}</p>` : ''}
${payments ? `<div class="note"><div class="label">${t.payments}</div><ul>${payments}</ul></div>` : ''}
${next.length > 0 ? `<div class="next">${t.nextService}: ${next.join(' · ')}</div>` : ''}
${invoice.warrantyText ? `<div class="note"><div class="label">${t.warranty}</div>${e(invoice.warrantyText)}</div>` : ''}
${invoice.terms ? `<div class="note"><div class="label">${t.terms}</div>${e(invoice.terms)}</div>` : ''}
${invoice.replacesInvoiceId ? `<p class="note">${t.replaces}</p>` : ''}
<footer>Powered by Gearva</footer>
</body>
</html>`;
}
