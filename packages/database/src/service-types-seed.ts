// Global service types (database.md 4.4, 9 item 2). Used by the seed and by the test
// database preparation, so tests run with the same types as a real install.
import type { PrismaClient } from './generated/prisma/client';

/**
 * Global service types with the starting intervals of database.md 4.4 (confirmed
 * 2026-10-23). Garages override them with their own rows; admins manage them in Phase 5.
 * `detailKey` names the Zod schema for ServiceRecord.details (null = no extra fields).
 */
const SERVICE_TYPES: {
  code: string;
  nameEn: string;
  nameAr: string;
  km: number | null;
  mi: number | null;
  months: number | null;
  detailKey: string | null;
}[] = [
  {
    code: 'OIL_CHANGE',
    nameEn: 'Oil change',
    nameAr: 'تغيير زيت المحرك',
    km: 5000,
    mi: 3600,
    months: 6,
    detailKey: 'oil',
  },
  {
    code: 'WHEELS',
    nameEn: 'Wheels (rotation)',
    nameAr: 'الإطارات (تبديل)',
    km: 10000,
    mi: 6000,
    months: 6,
    detailKey: 'wheels',
  },
  {
    code: 'STEERING_OIL',
    nameEn: 'Steering oil',
    nameAr: 'زيت المقود',
    km: 40000,
    mi: 25000,
    months: 24,
    detailKey: 'oil',
  },
  {
    code: 'TRANSMISSION_OIL',
    nameEn: 'Transmission oil',
    nameAr: 'زيت ناقل الحركة',
    km: 60000,
    mi: 40000,
    months: 36,
    detailKey: 'oil',
  },
  {
    code: 'DIFFERENTIAL_OIL',
    nameEn: 'Differential oil',
    nameAr: 'زيت الدفرنسيال',
    km: 60000,
    mi: 40000,
    months: 36,
    detailKey: 'oil',
  },
  {
    code: 'GEAR_OIL',
    nameEn: 'Gear oil',
    nameAr: 'زيت الجير',
    km: 40000,
    mi: 25000,
    months: 24,
    detailKey: 'oil',
  },
  {
    code: 'BRAKES',
    nameEn: 'Brakes',
    nameAr: 'الفرامل',
    km: 30000,
    mi: 20000,
    months: 12,
    detailKey: 'brakes',
  },
  {
    code: 'BATTERY',
    nameEn: 'Battery',
    nameAr: 'البطارية',
    km: null,
    mi: null,
    months: 24,
    detailKey: 'battery',
  },
  {
    code: 'AC',
    nameEn: 'Air conditioning',
    nameAr: 'المكيّف',
    km: null,
    mi: null,
    months: 12,
    detailKey: 'ac',
  },
  {
    code: 'ENGINE',
    nameEn: 'Engine',
    nameAr: 'المحرك',
    km: null,
    mi: null,
    months: null,
    detailKey: null,
  },
  {
    code: 'OTHER',
    nameEn: 'Other',
    nameAr: 'خدمة أخرى',
    km: null,
    mi: null,
    months: null,
    detailKey: null,
  },
];

export async function seedServiceTypes(db: PrismaClient): Promise<void> {
  const existing = await db.serviceType.findMany({
    where: { garageId: null },
    select: { code: true },
  });
  const have = new Set(existing.map((t) => t.code));
  const missing = SERVICE_TYPES.filter((t) => !have.has(t.code));
  await db.serviceType.createMany({
    data: missing.map((t) => ({
      code: t.code,
      nameEn: t.nameEn,
      nameAr: t.nameAr,
      defaultIntervalKm: t.km,
      defaultIntervalMi: t.mi,
      defaultIntervalMonths: t.months,
      detailKey: t.detailKey,
      sortOrder: SERVICE_TYPES.indexOf(t) * 10,
    })),
  });
  console.log(
    missing.length > 0
      ? `Created ${missing.length} global service types.`
      : 'Global service types already exist; left unchanged.',
  );
}
