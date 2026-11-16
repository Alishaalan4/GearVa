import { type OwnerServiceDetail, isServiceDetailKey } from '@gearva/contracts';

type Locale = 'ar' | 'en';

// Labels for service_records.details (contracts SERVICE_DETAIL_SCHEMAS), with the same
// words as garage-web's quick entry (messages quick.details / quick.choices), so the owner
// app shows ready-made label/value pairs and needs no knowledge of service types
// (docs/mobile-api.md 4.3).
const LABELS: Record<Locale, Record<string, string>> = {
  en: {
    brand: 'Brand',
    grade: 'Grade',
    liters: 'Litres',
    filterChanged: 'Filter changed',
    filterBrand: 'Filter brand',
    tireBrand: 'Tyre brand',
    tireSize: 'Tyre size',
    alignment: 'Alignment',
    balancing: 'Balancing',
    rotation: 'Rotation',
    amps: 'Amps',
    warrantyMonths: 'Warranty (months)',
    position: 'Position',
    part: 'Part',
    padBrand: 'Pad brand',
    gasRefill: 'Gas refill',
    compressor: 'Compressor',
  },
  ar: {
    brand: 'الماركة',
    grade: 'الدرجة',
    liters: 'ليترات',
    filterChanged: 'تم تغيير الفلتر',
    filterBrand: 'ماركة الفلتر',
    tireBrand: 'ماركة الإطارات',
    tireSize: 'مقاس الإطار',
    alignment: 'ضبط الزوايا',
    balancing: 'ترصيص',
    rotation: 'تبديل الإطارات',
    amps: 'أمبير',
    warrantyMonths: 'الكفالة (أشهر)',
    position: 'الموضع',
    part: 'القطعة',
    padBrand: 'ماركة الفحمات',
    gasRefill: 'تعبئة غاز',
    compressor: 'الكمبروسور',
  },
};

const CHOICES: Record<Locale, Record<string, string>> = {
  en: { FRONT: 'Front', REAR: 'Rear', PADS: 'Pads', DISCS: 'Discs', true: 'Yes', false: 'No' },
  ar: { FRONT: 'أمامي', REAR: 'خلفي', PADS: 'فحمات', DISCS: 'ديسكات', true: 'نعم', false: 'لا' },
};

/**
 * One label/value pair per filled-in field, in the schema's field order. Unknown keys or
 * a service type without details give an empty list; an empty value is left out.
 */
export function serviceDetailPairs(
  detailKey: string | null,
  details: unknown,
  locale: Locale,
): OwnerServiceDetail[] {
  if (!isServiceDetailKey(detailKey) || !details || typeof details !== 'object') return [];
  const pairs: OwnerServiceDetail[] = [];
  for (const [field, raw] of Object.entries(details as Record<string, unknown>)) {
    const label = LABELS[locale][field];
    if (!label || raw === null || raw === undefined || raw === '') continue;
    const text = String(raw);
    pairs.push({ label, value: CHOICES[locale][text] ?? text });
  }
  return pairs;
}
