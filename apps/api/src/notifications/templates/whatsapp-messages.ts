import { type WhatsappTemplate, centsToDecimal } from '@gearva/contracts';
import type { Locale } from '../notification-channel';

/**
 * Step 7.10 (flow.md 9.7): the ready WhatsApp messages staff send from their own phone, in
 * the customer's language. Fixed for every garage (user decision 2026-11-27). Amounts are
 * dollars with Western digits, as on the invoices.
 */
export interface WhatsappMessageData {
  customerName: string;
  garageName: string;
  /** the visit's car: "Toyota Corolla" and its plate */
  car: { vehicle: string; plate: string } | null;
  /** the visit's invoice (not cancelled) */
  invoice: { number: string; totalCents: number; remainingCents: number } | null;
  /** what the customer owes this garage (open invoices) */
  owedCents: number;
}

const dollars = (cents: number) => `$${centsToDecimal(cents)}`;

export function whatsappMessageText(
  template: WhatsappTemplate,
  d: WhatsappMessageData,
  locale: Locale,
): string {
  const en = locale === 'en';
  const hello = en
    ? `Hello ${d.customerName}, this is ${d.garageName}.`
    : `مرحباً ${d.customerName}، معك ${d.garageName}.`;
  const car = d.car;
  const yourCar = car
    ? en
      ? `your ${car.vehicle} (${car.plate})`
      : `سيارتك ${car.vehicle} (${car.plate})`
    : en
      ? 'your car'
      : 'سيارتك';

  switch (template) {
    case 'CAR_READY':
      return en
        ? `${hello} Good news: ${yourCar} is ready. You can pick it up whenever it suits you.`
        : `${hello} ${yourCar} جاهزة، يمكنك استلامها في الوقت الذي يناسبك.`;
    case 'INVOICE_READY': {
      const inv = d.invoice;
      if (!inv) return `${hello} `;
      const paid =
        inv.remainingCents === 0
          ? en
            ? ' It is fully paid, thank you!'
            : ' تم دفعها بالكامل، شكراً لك!'
          : en
            ? ` Left to pay: ${dollars(inv.remainingCents)}.`
            : ` المبلغ المتبقي: ${dollars(inv.remainingCents)}.`;
      return en
        ? `${hello} Your invoice ${inv.number} for ${yourCar} comes to ${dollars(inv.totalCents)}.${paid}`
        : `${hello} فاتورتك رقم ${inv.number} ل${yourCar} بقيمة ${dollars(inv.totalCents)}.${paid}`;
    }
    case 'PAYMENT_DUE':
      return en
        ? `${hello} A friendly reminder that ${dollars(d.owedCents)} is still due on your account. Thank you!`
        : `${hello} تذكير ودّي بأن مبلغ ${dollars(d.owedCents)} لا يزال مستحقاً على حسابك. شكراً لك!`;
    case 'SERVICE_DUE':
      return en
        ? `${hello} It may be time for the next service of ${yourCar}. Reply to book a visit.`
        : `${hello} قد يكون حان موعد الصيانة القادمة ل${yourCar}. راسلنا لحجز موعد.`;
    case 'THANK_YOU':
      return en
        ? `${hello} Thank you for bringing ${yourCar} to us. We are here whenever you need us.`
        : `${hello} شكراً لثقتك بنا في صيانة ${yourCar}. نحن في خدمتك متى احتجت.`;
    case 'FREE':
      return `${hello} `;
  }
}
