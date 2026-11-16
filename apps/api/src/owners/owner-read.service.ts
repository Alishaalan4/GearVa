import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type OwnerInvoiceDetail,
  type OwnerInvoiceItem,
  type OwnerInvoicesQuery,
  type OwnerUpcomingService,
  type OwnerVehicle,
  type OwnerVehicleDetail,
  type OwnerVisit,
  type OwnerVisitsQuery,
  type Paginated,
  addDays,
  dailyKmFor,
  estimateCurrentKm,
  localDate,
  nextServiceStatus,
} from '@gearva/contracts';
import type {
  Garage,
  GarageSettings,
  Invoice,
  Prisma,
  Reminder,
  ServiceType,
  TenantTx,
  Vehicle,
} from '@gearva/database';
import { OwnerDb } from '../common/db/owner-db';
import { AppException } from '../common/errors/app-exception';
import { paginated, toSkipTake } from '../common/pagination';
import { FILE_STORAGE, type FileStorage } from '../files/file-storage';
import { InvoicePdfService } from '../invoices/pdf/invoice-pdf.service';
import { fromDbDate } from '../maintenance/records.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { serviceDetailPairs } from './service-details';

type Locale = 'ar' | 'en';

const STATUS_ORDER = { OVERDUE: 0, SOON: 1, OK: 2 } as const;

/** Only what the owner may see: live cars of live customers at garages that exist. */
const LIVE_VEHICLE: Prisma.VehicleWhereInput = {
  deletedAt: null,
  customer: { deletedAt: null },
  garage: { deletedAt: null },
};
const LIVE_INVOICE: Prisma.InvoiceWhereInput = {
  customer: { deletedAt: null },
  garage: { deletedAt: null },
};

type CarRow = Vehicle & {
  garage: Garage & { settings: GarageSettings | null };
  reminders: (Reminder & {
    serviceType: ServiceType | null;
    sourceRecord: { customName: string | null; recommendedNote: string | null };
  })[];
};

function notFound(what: string): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, `${what} not found`);
}

function typeName(type: ServiceType | null, customName: string | null, locale: Locale): string {
  if (customName) return customName;
  if (!type) return '';
  return locale === 'en' ? type.nameEn : type.nameAr;
}

/**
 * The owner app's read API (docs/mobile-api.md 3.6, 4, 5; flow.md 2.4): the person's cars,
 * history and invoices at every garage, each labelled with its garage. Everything goes
 * through OwnerDb (the owner_read policies) and filters by ownerId as well. A locked
 * garage still shows its history and invoices (flow.md 2.4 step 7); a deleted garage or a
 * removed customer shows nothing.
 */
@Injectable()
export class OwnerReadService {
  constructor(
    private readonly db: OwnerDb,
    private readonly systemSettings: SystemSettingsService,
    private readonly pdf: InvoicePdfService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  /** The language for names and labels: the request's, else the owner's saved one. */
  async locale(requested: string | undefined): Promise<Locale> {
    const tag = requested?.trim().slice(0, 2).toLowerCase();
    if (tag === 'ar' || tag === 'en') return tag;
    const ownerId = this.db.ownerId;
    const owner = await this.db.run((tx) =>
      tx.owner.findUniqueOrThrow({ where: { id: ownerId }, select: { locale: true } }),
    );
    return owner.locale === 'en' ? 'en' : 'ar';
  }

  /** mobile-api.md 4.1: every car, oldest first, each with its soonest service. */
  async vehicles(locale: Locale): Promise<OwnerVehicle[]> {
    const ownerId = this.db.ownerId;
    const { defaultDailyKm } = await this.systemSettings.get();
    const cars = await this.db.run((tx) => this.loadCars(tx, { ownerId, ...LIVE_VEHICLE }));
    // The list has only the soonest service; the full list is in the car's detail.
    return cars.map((car) => {
      const { upcoming, ...rest } = this.toVehicle(car, locale, defaultDailyKm);
      void upcoming;
      return rest;
    });
  }

  /** mobile-api.md 4.2: the car and every open reminder. */
  async vehicle(vehicleId: string, locale: Locale): Promise<OwnerVehicleDetail> {
    const ownerId = this.db.ownerId;
    const { defaultDailyKm } = await this.systemSettings.get();
    const [car] = await this.db.run((tx) =>
      this.loadCars(tx, { id: vehicleId, ownerId, ...LIVE_VEHICLE }),
    );
    if (!car) throw notFound('Car');
    return this.toVehicle(car, locale, defaultDailyKm);
  }

  /** mobile-api.md 4.3: the car's visits, newest first, with label/value details. */
  async visits(
    vehicleId: string,
    query: OwnerVisitsQuery,
    locale: Locale,
  ): Promise<Paginated<OwnerVisit>> {
    const ownerId = this.db.ownerId;
    const [visits, total] = await this.db.run(async (tx) => {
      const car = await tx.vehicle.findFirst({
        where: { id: vehicleId, ownerId, ...LIVE_VEHICLE },
        select: { id: true },
      });
      if (!car) throw notFound('Car');
      const where: Prisma.VisitWhereInput = { vehicleId, ownerId };
      return [
        await tx.visit.findMany({
          where,
          include: {
            garage: { select: { id: true, name: true } },
            branch: { select: { name: true } },
            records: {
              include: { serviceType: true },
              orderBy: [{ performedAt: 'asc' }, { createdAt: 'asc' }],
            },
            invoices: { orderBy: { createdAt: 'desc' } },
          },
          orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
          ...toSkipTake(query),
        }),
        await tx.visit.count({ where }),
      ] as const;
    });
    const items = visits.map((v): OwnerVisit => {
      // A cancelled invoice that was reissued: show the one that counts.
      const invoice = v.invoices.find((i) => i.status !== 'CANCELLED') ?? v.invoices[0] ?? null;
      return {
        id: v.id,
        date: (v.finishedAt ?? v.openedAt).toISOString(),
        odometerKm: v.odometerKm,
        garage: v.garage,
        branchName: v.branch.name,
        services: v.records.map((r) => ({
          serviceName: typeName(r.serviceType, r.customName, locale),
          details: serviceDetailPairs(r.serviceType.detailKey, r.details, locale),
          notes: r.notes,
          warrantyUntil: fromDbDate(r.warrantyUntil),
          recommendation: r.recommendedNote,
          nextDueKm: r.nextDueKm,
          nextDueDate: fromDbDate(r.nextDueDate),
        })),
        invoice: invoice && {
          id: invoice.id,
          number: invoice.number,
          totalCents: invoice.totalCents,
          status: invoice.status,
        },
      };
    });
    return paginated(items, total, query);
  }

  /** mobile-api.md 5.1: newest first, optionally one status. */
  async invoices(query: OwnerInvoicesQuery): Promise<Paginated<OwnerInvoiceItem>> {
    const ownerId = this.db.ownerId;
    const where: Prisma.InvoiceWhereInput = {
      ownerId,
      ...LIVE_INVOICE,
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await this.db.run(
      async (tx) =>
        [
          await tx.invoice.findMany({
            where,
            include: INVOICE_LIST_INCLUDE,
            orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
            ...toSkipTake(query),
          }),
          await tx.invoice.count({ where }),
        ] as const,
    );
    return paginated(rows.map(toInvoiceItem), total, query);
  }

  /** mobile-api.md 5.2. */
  async invoice(invoiceId: string): Promise<OwnerInvoiceDetail> {
    const ownerId = this.db.ownerId;
    const row = await this.db.run((tx) =>
      tx.invoice.findFirst({
        where: { id: invoiceId, ownerId, ...LIVE_INVOICE },
        include: {
          ...INVOICE_LIST_INCLUDE,
          items: { orderBy: { position: 'asc' } },
          payments: { orderBy: { paidAt: 'asc' } },
        },
      }),
    );
    if (!row) throw notFound('Invoice');
    return {
      ...toInvoiceItem(row),
      items: row.items.map((i) => ({
        description: i.description,
        brand: i.brand,
        grade: i.grade,
        quantity: i.quantity.toString(),
        unitPriceCents: i.unitPriceCents,
        totalCents: i.totalCents,
      })),
      subtotalCents: row.subtotalCents,
      discountCents: row.discountCents,
      vatCents: row.vatCents,
      payments: row.payments.map((p) => ({
        amountCents: p.amountCents,
        method: p.method,
        paidAt: p.paidAt.toISOString(),
      })),
      nextServiceKm: row.nextServiceKm,
      nextServiceDate: fromDbDate(row.nextServiceDate),
      warrantyText: row.warrantyText,
      cancelReason: row.cancelReason,
    };
  }

  /**
   * mobile-api.md 5.3: the stored PDF, in the invoice's language. While it is being made
   * (or was lost), a render is queued and the app retries on INVOICE_PDF_NOT_READY.
   */
  async invoicePdf(invoiceId: string): Promise<{ number: string; pdf: Buffer }> {
    const ownerId = this.db.ownerId;
    const row = await this.db.run((tx) =>
      tx.invoice.findFirst({
        where: { id: invoiceId, ownerId, ...LIVE_INVOICE },
        select: { number: true, garageId: true, pdfFile: true },
      }),
    );
    if (!row) throw notFound('Invoice');
    const pdf = row.pdfFile ? await this.storage.get(row.pdfFile.storageKey) : null;
    if (!pdf) {
      await this.pdf.queueRender(invoiceId, row.garageId);
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.INVOICE_PDF_NOT_READY,
        'The PDF is being prepared. Try again in a moment',
      );
    }
    return { number: row.number, pdf };
  }

  /** mobile-api.md 3.6: the logo of a garage where the person is a customer. */
  async garageLogo(garageId: string): Promise<{ bytes: Buffer; mimeType: string }> {
    const ownerId = this.db.ownerId;
    const logo = await this.db.run(async (tx) => {
      const link = await tx.garageCustomer.findFirst({
        where: { ownerId, garageId, deletedAt: null, garage: { deletedAt: null } },
        select: { id: true },
      });
      if (!link) return null;
      const settings = await tx.garageSettings.findUnique({
        where: { garageId },
        include: { logo: true },
      });
      return settings?.logo ?? null;
    });
    const bytes = logo ? await this.storage.get(logo.storageKey) : null;
    if (!logo || !bytes) throw notFound('Logo');
    return { bytes, mimeType: logo.mimeType };
  }

  private loadCars(tx: TenantTx, where: Prisma.VehicleWhereInput): Promise<CarRow[]> {
    return tx.vehicle.findMany({
      where,
      include: {
        garage: { include: { settings: true } },
        reminders: {
          where: { status: { in: ['ACTIVE', 'SENT'] } },
          include: {
            serviceType: true,
            sourceRecord: { select: { customName: true, recommendedNote: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * flow.md 5.2 for the estimate, and the reminder scan's rule (flow.md 9.1) for each
   * open reminder's status. Soonest first: overdue, then soon, then by the day it is
   * expected (its date, or the day the estimate reaches its km).
   */
  private toVehicle(car: CarRow, locale: Locale, systemDailyKm: number): OwnerVehicleDetail {
    const settings = car.garage.settings;
    const estimate = {
      currentKm: car.currentKm,
      lastOdometerAt: car.lastOdometerAt,
      avgDailyKm: car.avgDailyKm === null ? null : Number(car.avgDailyKm),
      garageDefaultDailyKm: settings?.defaultDailyKm,
      systemDefaultDailyKm: systemDailyKm,
    };
    const estimatedKm = estimateCurrentKm(estimate);
    const dailyKm = dailyKmFor(estimate);
    const today = localDate(new Date(), car.garage.timezone);
    const check = {
      estimatedKm,
      today,
      leadKm: settings?.reminderLeadKm ?? 500,
      leadDays: settings?.reminderLeadDays ?? 7,
    };

    const upcoming = car.reminders
      .map((r) => {
        const dueKm = r.kind === 'SERVICE_DUE' ? r.nextDueKm : null;
        const dueDate = fromDbDate(r.nextDueDate);
        const name = typeName(r.serviceType, r.sourceRecord.customName, locale);
        const kmDay =
          dueKm === null
            ? null
            : addDays(today, Math.ceil(Math.max(0, dueKm - estimatedKm) / dailyKm));
        const expected =
          [dueDate, kmDay].filter((d): d is string => d !== null).sort()[0] ?? '9999';
        const item: OwnerUpcomingService = {
          serviceName:
            r.kind === 'WARRANTY_END'
              ? locale === 'en'
                ? `${name} warranty ends`
                : `انتهاء كفالة ${name}`
              : r.kind === 'RECOMMENDED_NEXT'
                ? (r.sourceRecord.recommendedNote ?? name)
                : name,
          dueKm,
          dueDate,
          status: nextServiceStatus(
            { kind: r.kind, nextDueKm: dueKm, nextDueDate: dueDate },
            check,
          ),
        };
        return { item, expected };
      })
      .sort(
        (a, b) =>
          STATUS_ORDER[a.item.status] - STATUS_ORDER[b.item.status] ||
          a.expected.localeCompare(b.expected),
      )
      .map((x) => x.item);

    return {
      id: car.id,
      garage: { id: car.garage.id, name: car.garage.name },
      plate: car.plate,
      make: car.make,
      model: car.model,
      year: car.year,
      distanceUnit: car.distanceUnit,
      lastRecordedKm: car.currentKm,
      lastRecordedAt: car.lastOdometerAt?.toISOString() ?? null,
      estimatedKm,
      nextService: upcoming[0] ?? null,
      upcoming,
    };
  }
}

const INVOICE_LIST_INCLUDE = {
  garage: { select: { id: true, name: true } },
  vehicle: { select: { id: true, plate: true, make: true, model: true } },
} satisfies Prisma.InvoiceInclude;

function toInvoiceItem(
  row: Invoice & {
    garage: { id: string; name: string };
    vehicle: { id: string; plate: string; make: string; model: string };
  },
): OwnerInvoiceItem {
  return {
    id: row.id,
    number: row.number,
    issuedAt: row.issuedAt.toISOString(),
    garage: row.garage,
    vehicle: row.vehicle,
    status: row.status,
    totalCents: row.totalCents,
    paidCents: row.paidCents,
    remainingCents: row.remainingCents,
  };
}
