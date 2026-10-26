import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type HistoryItem,
  OTHER_SERVICE_CODE,
  type Paginated,
  type PaginationQuery,
  type PrefillResponse,
  SERVICE_DETAIL_SCHEMAS,
  type ServiceLineInput,
  type ServiceRecordItem,
  type SuggestionField,
  addMonths,
  computeNextDue,
  estimateCurrentKm,
  fromKm,
  isServiceDetailKey,
  lineTotalCents,
  localDate,
  quantityToHundredths,
  resolveInterval,
  toKm,
} from '@gearva/contracts';
import type { Prisma, ServiceRecord, ServiceType, TenantTx, User, Vehicle } from '@gearva/database';
import { TenantDb } from '../common/db/tenant-db';
import { AppException } from '../common/errors/app-exception';
import { paginated, toSkipTake } from '../common/pagination';
import { SuggestionsService } from '../suggestions/suggestions.service';
import { ServiceTypesService, toServiceTypeItem } from './service-types.service';

/** A YYYY-MM-DD date for a `date` column, and back. */
const toDbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
const fromDbDate = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

/** Detail fields that feed autocomplete lists (flow.md 4.3). */
const DETAIL_SUGGESTIONS: Record<string, Partial<Record<string, SuggestionField>>> = {
  oil: { brand: 'OIL_BRAND', grade: 'OIL_GRADE', filterBrand: 'FILTER_BRAND' },
  wheels: { tireBrand: 'TIRE_BRAND' },
  battery: { brand: 'BATTERY_BRAND' },
  brakes: { padBrand: 'BRAKE_PAD_BRAND' },
};

type RecordWithRelations = ServiceRecord & { serviceType: ServiceType; mechanic: User };

export function toRecordItem(r: RecordWithRelations): ServiceRecordItem {
  return {
    id: r.id,
    visitId: r.visitId,
    serviceType: {
      id: r.serviceType.id,
      code: r.serviceType.code,
      nameEn: r.serviceType.nameEn,
      nameAr: r.serviceType.nameAr,
    },
    customName: r.customName,
    performedAt: r.performedAt.toISOString(),
    odometerKm: r.odometerKm,
    quantity: r.quantity.toFixed(2),
    unitPriceCents: r.unitPriceCents,
    totalCents: r.totalCents,
    laborCents: r.laborCents,
    partsCents: r.partsCents,
    notes: r.notes,
    details: (r.details ?? {}) as Record<string, unknown>,
    warrantyUntil: fromDbDate(r.warrantyUntil),
    recommendedNote: r.recommendedNote,
    recommendedAfterMonths: r.recommendedAfterMonths,
    nextDueKm: r.nextDueKm,
    nextDueDate: fromDbDate(r.nextDueDate),
    mechanic: { id: r.mechanic.id, name: r.mechanic.name },
  };
}

function invalid(path: (string | number)[], message: string): AppException {
  return new AppException(HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED, message, {
    issues: [{ path, message }],
  });
}

export interface SaveContext {
  garageId: string;
  branchId: string;
  visitId: string;
  vehicle: Vehicle;
  mechanicId: string;
  /** km at service time */
  odometerKm: number;
  performedAt: Date;
  /** the garage's time zone, for due dates */
  timeZone: string;
}

/**
 * Service records, next-change logic and reminders (flow.md 4.3, 6; database.md 4.4).
 * Writes run inside the caller's transaction, so a visit and everything it creates are
 * saved together or not at all (flow.md 4.2).
 */
@Injectable()
export class RecordsService {
  constructor(
    private readonly db: TenantDb,
    private readonly types: ServiceTypesService,
    private readonly suggestions: SuggestionsService,
  ) {}

  /** Saves service lines, with their next due values, reminders and suggestions. */
  async saveLines(
    tx: TenantTx,
    ctx: SaveContext,
    lines: ServiceLineInput[],
  ): Promise<ServiceRecord[]> {
    const records: ServiceRecord[] = [];
    for (const [index, line] of lines.entries()) {
      records.push(await this.saveLine(tx, ctx, line, index));
    }
    return records;
  }

  private async saveLine(
    tx: TenantTx,
    ctx: SaveContext,
    line: ServiceLineInput,
    index: number,
  ): Promise<ServiceRecord> {
    const { row, effective } = await this.types.resolve(tx, ctx.garageId, line.serviceTypeId);
    const isOther = row.code === OTHER_SERVICE_CODE;
    if (isOther && !line.customName) {
      throw invalid(['services', index, 'customName'], 'Name the service');
    }
    const details = this.checkDetails(effective.detailKey, line.details, index);

    const hundredths = quantityToHundredths(line.quantity);
    const unit = ctx.vehicle.distanceUnit;
    const interval = resolveInterval(unit, effective);
    const computed = computeNextDue({
      odometerKm: ctx.odometerKm,
      performedAt: ctx.performedAt,
      timeZone: ctx.timeZone,
      ...interval,
    });
    // flow.md 6: the mechanic may change the next due values; left out = computed.
    const nextDueKm =
      line.nextDueOdometer === undefined
        ? computed.nextDueKm
        : line.nextDueOdometer === null
          ? null
          : toKm(line.nextDueOdometer, unit);
    const nextDueDate = line.nextDueDate === undefined ? computed.nextDueDate : line.nextDueDate;

    const record = await tx.serviceRecord.create({
      data: {
        garageId: ctx.garageId,
        branchId: ctx.branchId,
        visitId: ctx.visitId,
        vehicleId: ctx.vehicle.id,
        ownerId: ctx.vehicle.ownerId,
        serviceTypeId: row.id,
        customName: isOther ? (line.customName ?? null) : null,
        performedAt: ctx.performedAt,
        odometerKm: ctx.odometerKm,
        quantity: (hundredths / 100).toFixed(2),
        unitPriceCents: line.unitPriceCents,
        totalCents: lineTotalCents(line.quantity, line.unitPriceCents),
        laborCents: line.laborCents ?? null,
        partsCents: line.partsCents ?? null,
        mechanicId: ctx.mechanicId,
        notes: line.notes ?? null,
        details: details as Prisma.InputJsonObject,
        warrantyUntil: line.warrantyUntil ? toDbDate(line.warrantyUntil) : null,
        recommendedNote: line.recommendedNote ?? null,
        recommendedAfterMonths: line.recommendedAfterMonths ?? null,
        nextDueKm,
        nextDueDate: nextDueDate ? toDbDate(nextDueDate) : null,
      },
    });

    await this.saveReminders(tx, ctx, record, row, isOther);
    if (isOther && line.customName) {
      await this.suggestions.record(tx, ctx.garageId, 'SERVICE_NAME', line.customName);
    }
    const fields = effective.detailKey ? DETAIL_SUGGESTIONS[effective.detailKey] : undefined;
    for (const [key, field] of Object.entries(fields ?? {})) {
      const value = details[key];
      if (field && typeof value === 'string') {
        await this.suggestions.record(tx, ctx.garageId, field, value);
      }
    }
    return record;
  }

  /** The `details` shape named by the type's detailKey (database.md 4.4). */
  private checkDetails(
    detailKey: string | null,
    details: Record<string, unknown>,
    index: number,
  ): Record<string, unknown> {
    if (!isServiceDetailKey(detailKey)) {
      if (Object.keys(details).length > 0) {
        throw invalid(['services', index, 'details'], 'This service has no details');
      }
      return {};
    }
    const parsed = SERVICE_DETAIL_SCHEMAS[detailKey].safeParse(details);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw invalid(
        ['services', index, 'details', ...(issue?.path ?? []).map(String)],
        issue?.message ?? 'Invalid details',
      );
    }
    return parsed.data;
  }

  /**
   * flow.md 6: the previous due reminder of this car and service is COMPLETED and a new
   * one replaces it; a warranty end and a "recommended in N months" get their own.
   * OTHER services never complete each other (two different custom services share it).
   */
  private async saveReminders(
    tx: TenantTx,
    ctx: SaveContext,
    record: ServiceRecord,
    type: ServiceType,
    isOther: boolean,
  ): Promise<void> {
    if (!isOther) {
      await tx.reminder.updateMany({
        where: {
          garageId: ctx.garageId,
          vehicleId: ctx.vehicle.id,
          kind: 'SERVICE_DUE',
          status: { in: ['ACTIVE', 'SENT'] },
          serviceType: { code: type.code },
        },
        data: { status: 'COMPLETED' },
      });
    }
    const base = {
      garageId: ctx.garageId,
      vehicleId: ctx.vehicle.id,
      ownerId: ctx.vehicle.ownerId,
      serviceTypeId: type.id,
      sourceRecordId: record.id,
    };
    if (record.nextDueKm !== null || record.nextDueDate !== null) {
      await tx.reminder.create({
        data: {
          ...base,
          kind: 'SERVICE_DUE',
          nextDueKm: record.nextDueKm,
          nextDueDate: record.nextDueDate,
        },
      });
    }
    if (record.warrantyUntil) {
      await tx.reminder.create({
        data: { ...base, kind: 'WARRANTY_END', nextDueDate: record.warrantyUntil },
      });
    }
    if (record.recommendedAfterMonths) {
      const due = addMonths(
        localDate(ctx.performedAt, ctx.timeZone),
        record.recommendedAfterMonths,
      );
      await tx.reminder.create({
        data: { ...base, kind: 'RECOMMENDED_NEXT', nextDueDate: toDbDate(due) },
      });
    }
  }

  /** flow.md 4.1 step 3: everything quick entry can fill in before anything is typed. */
  async prefill(vehicleId: string, serviceTypeId: string): Promise<PrefillResponse> {
    const garageId = this.db.garageId;
    return this.db.run(async (tx) => {
      const vehicle = await tx.vehicle.findFirst({
        where: { id: vehicleId, garageId, deletedAt: null },
      });
      if (!vehicle) throw vehicleNotFound();
      const { effective } = await this.types.resolve(tx, garageId, serviceTypeId);
      const garage = await tx.garage.findUniqueOrThrow({
        where: { id: garageId },
        select: { timezone: true },
      });
      const settings = await tx.garageSettings.findUnique({
        where: { garageId },
        select: { defaultDailyKm: true },
      });
      const last = await tx.serviceRecord.findFirst({
        where: { garageId, vehicleId, serviceType: { code: effective.code } },
        orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }],
      });

      const estimatedKm = estimateCurrentKm({
        currentKm: vehicle.currentKm,
        lastOdometerAt: vehicle.lastOdometerAt,
        avgDailyKm: vehicle.avgDailyKm === null ? null : Number(vehicle.avgDailyKm),
        garageDefaultDailyKm: settings?.defaultDailyKm,
      });
      const next = computeNextDue({
        odometerKm: estimatedKm,
        performedAt: new Date(),
        timeZone: garage.timezone,
        ...resolveInterval(vehicle.distanceUnit, effective),
      });
      return {
        estimatedKm,
        estimatedOdometer: fromKm(estimatedKm, vehicle.distanceUnit),
        serviceType: toServiceTypeItem(effective),
        last: last
          ? {
              performedAt: last.performedAt.toISOString(),
              odometerKm: last.odometerKm,
              quantity: last.quantity.toFixed(2),
              unitPriceCents: last.unitPriceCents,
              details: (last.details ?? {}) as Record<string, unknown>,
              customName: last.customName,
            }
          : null,
        ...next,
      };
    });
  }

  /** The service history timeline of a car, newest first (database.md 8). */
  async history(vehicleId: string, query: PaginationQuery): Promise<Paginated<HistoryItem>> {
    const garageId = this.db.garageId;
    const [rows, total] = await this.db.run(async (tx) => {
      const vehicle = await tx.vehicle.findFirst({
        where: { id: vehicleId, garageId, deletedAt: null },
        select: { id: true },
      });
      if (!vehicle) throw vehicleNotFound();
      const where = { garageId, vehicleId };
      return [
        await tx.serviceRecord.findMany({
          where,
          include: {
            serviceType: true,
            mechanic: true,
            visit: { select: { id: true, status: true, branch: { select: { code: true } } } },
          },
          orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }],
          ...toSkipTake(query),
        }),
        await tx.serviceRecord.count({ where }),
      ] as const;
    });
    const items = rows.map((r): HistoryItem => ({
      ...toRecordItem(r),
      visit: { id: r.visit.id, status: r.visit.status, branchCode: r.visit.branch.code },
    }));
    return paginated(items, total, query);
  }
}

export function vehicleNotFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Vehicle not found');
}
