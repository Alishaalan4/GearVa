import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  type AddRecordsInput,
  ERROR_CODES,
  type OdometerConfirmationDetails,
  type OpenVisitInput,
  type QuickVisitInput,
  type UpdateVisitInput,
  type VisitDetail,
  averageDailyKm,
  checkOdometer,
  toKm,
} from '@gearva/contracts';
import type { Notification, TenantTx, Vehicle, Visit } from '@gearva/database';
import { AuditService } from '../audit/audit.service';
import { RequestContext } from '../common/context/request-context';
import { TenantDb } from '../common/db/tenant-db';
import { AppException } from '../common/errors/app-exception';
import { toCustomerSummary, toVehicleItem } from '../customers/mappers';
import { RecordsService, toRecordItem, vehicleNotFound } from '../maintenance/records.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Readings used for the average: the visits, plus the car's reading before this one. */
const AVG_VISITS = 5;

function visitNotFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Visit not found');
}

function alreadyFinished(): AppException {
  return new AppException(
    HttpStatus.CONFLICT,
    ERROR_CODES.VISIT_ALREADY_FINISHED,
    'This visit is already finished',
  );
}

interface Opened {
  visit: Visit;
  vehicle: Vehicle;
  timeZone: string;
  correction: { fromKm: number; toKm: number } | null;
}

/**
 * Visits and quick entry (flow.md 4, 5). A visit and everything it creates (records,
 * next due values, reminders, the car's odometer and average) are saved in one
 * transaction. Staff of one branch work only with that branch's visits (flow.md 1).
 */
@Injectable()
export class VisitsService {
  private readonly logger = new Logger(VisitsService.name);

  constructor(
    private readonly db: TenantDb,
    private readonly context: RequestContext,
    private readonly records: RecordsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** flow.md 4.2: POST /v1/visits/quick, in one transaction. */
  async quick(input: QuickVisitInput): Promise<VisitDetail> {
    const { visitId, correction, carReady } = await this.db.run(async (tx) => {
      const opened = await this.open(tx, input);
      await this.records.saveLines(tx, this.saveContext(opened), input.services);
      const notification = input.finish ? await this.close(tx, opened.visit, opened.vehicle) : null;
      return { visitId: opened.visit.id, correction: opened.correction, carReady: notification };
    });
    await this.afterCommit(visitId, correction, carReady);
    return this.detail(visitId);
  }

  /** A longer job: an IN_PROGRESS visit, records added later. */
  async openVisit(input: OpenVisitInput): Promise<VisitDetail> {
    const { visitId, correction } = await this.db.run(async (tx) => {
      const opened = await this.open(tx, input);
      return { visitId: opened.visit.id, correction: opened.correction };
    });
    await this.afterCommit(visitId, correction, null);
    return this.detail(visitId);
  }

  async addRecords(visitId: string, input: AddRecordsInput): Promise<VisitDetail> {
    await this.db.run(async (tx) => {
      const visit = await this.lockOpenVisit(tx, visitId);
      const vehicle = await tx.vehicle.findFirstOrThrow({
        where: { id: visit.vehicleId, garageId: visit.garageId },
      });
      const timeZone = await this.timeZone(tx);
      await this.records.saveLines(
        tx,
        this.saveContext({ visit, vehicle, timeZone }),
        input.services,
      );
    });
    return this.detail(visitId);
  }

  async update(visitId: string, input: UpdateVisitInput): Promise<VisitDetail> {
    await this.db.run(async (tx) => {
      const visit = await this.lockOpenVisit(tx, visitId);
      await tx.visit.update({
        where: { id: visit.id },
        data: { status: input.status, notes: input.notes },
      });
    });
    return this.detail(visitId);
  }

  /**
   * "Finish visit" (flow.md 4.4): DONE and finishedAt, with at least one record. The row
   * lock makes a second, simultaneous finish answer VISIT_ALREADY_FINISHED (flow.md 13).
   * From Phase 3 this is also where the invoice is created.
   */
  async finish(visitId: string): Promise<VisitDetail> {
    const carReady = await this.db.run(async (tx) => {
      const visit = await this.lockOpenVisit(tx, visitId);
      const count = await tx.serviceRecord.count({ where: { visitId: visit.id } });
      if (count === 0) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.VISIT_HAS_NO_RECORDS,
          'Add at least one service before finishing',
        );
      }
      const vehicle = await tx.vehicle.findFirstOrThrow({
        where: { id: visit.vehicleId, garageId: visit.garageId },
      });
      return this.close(tx, visit, vehicle);
    });
    await this.afterCommit(visitId, null, carReady);
    return this.detail(visitId);
  }

  async detail(visitId: string): Promise<VisitDetail> {
    const visit = await this.db.run((tx) =>
      tx.visit.findFirst({
        where: this.visitScope(visitId),
        include: {
          branch: true,
          vehicle: true,
          customer: { include: { owner: true } },
          mechanic: true,
          records: {
            include: { serviceType: true, mechanic: true },
            orderBy: [{ performedAt: 'asc' }, { createdAt: 'asc' }],
          },
        },
      }),
    );
    if (!visit) throw visitNotFound();
    return {
      id: visit.id,
      status: visit.status,
      branch: { id: visit.branch.id, code: visit.branch.code, name: visit.branch.name },
      vehicle: toVehicleItem(visit.vehicle),
      customer: toCustomerSummary(visit.customer),
      mechanic: { id: visit.mechanic.id, name: visit.mechanic.name },
      odometerKm: visit.odometerKm,
      openedAt: visit.openedAt.toISOString(),
      finishedAt: visit.finishedAt?.toISOString() ?? null,
      notes: visit.notes,
      records: visit.records.map(toRecordItem),
      totalCents: visit.records.reduce((sum, r) => sum + r.totalCents, 0),
    };
  }

  /**
   * Opens a visit: branch, odometer check (flow.md 5.3), then the car's new odometer and
   * average daily usage (5.1). A lower reading or a jump over 5,000 km/day needs the
   * request to repeat the check as `confirmOdometer`.
   */
  private async open(tx: TenantTx, input: OpenVisitInput): Promise<Opened> {
    const garageId = this.db.garageId;
    const actor = this.context.actor;
    if (!actor?.id) throw new Error('A visit needs a signed-in staff member');

    const vehicle = await tx.vehicle.findFirst({
      where: { id: input.vehicleId, garageId, deletedAt: null },
    });
    if (!vehicle) throw vehicleNotFound();
    const branchId = await this.branchFor(tx, input.branchId);

    const now = new Date();
    const newKm = toKm(input.odometer, vehicle.distanceUnit);
    const previous = { km: vehicle.currentKm, at: vehicle.lastOdometerAt ?? vehicle.createdAt };
    const check = checkOdometer(previous, { km: newKm, at: now });
    if (check !== 'OK' && input.confirmOdometer !== check) {
      const details: OdometerConfirmationDetails = { check, previousKm: vehicle.currentKm, newKm };
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.ODOMETER_CONFIRMATION_REQUIRED,
        check === 'CORRECTION'
          ? 'The odometer is lower than the last reading'
          : 'The odometer jumped more than 5,000 km per day',
        { ...details },
      );
    }

    const visit = await tx.visit.create({
      data: {
        garageId,
        branchId,
        vehicleId: vehicle.id,
        garageCustomerId: vehicle.garageCustomerId,
        ownerId: vehicle.ownerId,
        mechanicId: actor.id,
        odometerKm: newKm,
        openedAt: now,
        notes: input.notes ?? null,
      },
    });

    const visits = await tx.visit.findMany({
      where: { garageId, vehicleId: vehicle.id },
      orderBy: { openedAt: 'desc' },
      take: AVG_VISITS,
      select: { odometerKm: true, openedAt: true },
    });
    const readings = new Map<string, { km: number; at: Date }>();
    for (const r of [previous, ...visits.map((v) => ({ km: v.odometerKm, at: v.openedAt }))]) {
      readings.set(`${r.at.getTime()}:${r.km}`, r);
    }
    const updated = await tx.vehicle.update({
      where: { id: vehicle.id },
      data: {
        currentKm: newKm,
        lastOdometerAt: now,
        avgDailyKm: averageDailyKm([...readings.values()]),
      },
    });

    return {
      visit,
      vehicle: updated,
      timeZone: await this.timeZone(tx),
      correction: check === 'CORRECTION' ? { fromKm: vehicle.currentKm, toKm: newKm } : null,
    };
  }

  /** Staff of one branch always use it; owners and managers choose, default the main one. */
  private async branchFor(tx: TenantTx, requested: string | undefined): Promise<string> {
    const garageId = this.db.garageId;
    const own = this.context.actor?.branchId ?? null;
    if (own && requested && requested !== own) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.FORBIDDEN,
        'You can only record visits in your own branch',
      );
    }
    const branch = await tx.branch.findFirst({
      where: own || requested ? { id: own ?? requested, garageId } : { garageId, isMain: true },
    });
    if (!branch) {
      throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Branch not found');
    }
    if (!branch.isActive) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.BRANCH_INACTIVE,
        'This branch is deactivated',
      );
    }
    return branch.id;
  }

  /** The visit, locked for this transaction, and still open. */
  private async lockOpenVisit(tx: TenantTx, visitId: string): Promise<Visit> {
    const scope = this.visitScope(visitId);
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "visits"
      WHERE "id" = ${visitId}::uuid AND "garage_id" = ${scope.garageId}::uuid
      FOR UPDATE`;
    if (locked.length === 0) throw visitNotFound();
    const visit = await tx.visit.findFirst({ where: scope });
    if (!visit) throw visitNotFound();
    if (visit.finishedAt) throw alreadyFinished();
    return visit;
  }

  /** DONE + finishedAt, and the CAR_READY notification (flow.md 4.4). */
  private async close(tx: TenantTx, visit: Visit, vehicle: Vehicle): Promise<Notification> {
    await tx.visit.update({
      where: { id: visit.id },
      data: { status: 'DONE', finishedAt: new Date() },
    });
    const customer = await tx.garageCustomer.findFirstOrThrow({
      where: { id: visit.garageCustomerId, garageId: visit.garageId },
      include: { owner: true },
    });
    const garage = await tx.garage.findUniqueOrThrow({
      where: { id: visit.garageId },
      select: { name: true },
    });
    // No email or app yet: recorded for WhatsApp and logged SKIPPED until one exists.
    const { notification } = await this.notifications.record(tx, {
      garageId: visit.garageId,
      ownerId: visit.ownerId,
      channel: 'WHATSAPP',
      type: 'CAR_READY',
      template: 'car-ready',
      locale: customer.owner.locale === 'en' ? 'en' : 'ar',
      recipient: customer.owner.phone,
      payload: { name: customer.name, plate: vehicle.plate, garageName: garage.name },
      dedupeKey: `CAR_READY:${visit.id}`,
      refType: 'visit',
      refId: visit.id,
    });
    return notification;
  }

  /** Audit a confirmed odometer correction (flow.md 5.3) and queue CAR_READY. */
  private async afterCommit(
    visitId: string,
    correction: Opened['correction'],
    carReady: Notification | null,
  ): Promise<void> {
    if (correction) {
      const visit = await this.db.run((tx) =>
        tx.visit.findFirstOrThrow({ where: { id: visitId, garageId: this.db.garageId } }),
      );
      await this.audit.record({
        action: 'vehicle.odometer_correction',
        entityType: 'vehicle',
        entityId: visit.vehicleId,
        before: { km: correction.fromKm },
        after: { km: correction.toKm, visitId },
      });
    }
    if (carReady) {
      try {
        await this.notifications.dispatch(carReady);
      } catch (error) {
        this.logger.error(`Could not queue CAR_READY ${carReady.id}`, error as Error);
      }
    }
  }

  /** A visit of this garage; staff of one branch see only that branch (flow.md 1). */
  private visitScope(visitId: string) {
    const branchId = this.context.actor?.branchId;
    return { id: visitId, garageId: this.db.garageId, ...(branchId ? { branchId } : {}) };
  }

  private saveContext(opened: Pick<Opened, 'visit' | 'vehicle' | 'timeZone'>) {
    return {
      garageId: opened.visit.garageId,
      branchId: opened.visit.branchId,
      visitId: opened.visit.id,
      vehicle: opened.vehicle,
      mechanicId: this.context.actor?.id ?? opened.visit.mechanicId,
      odometerKm: opened.visit.odometerKm,
      performedAt: new Date(),
      timeZone: opened.timeZone,
    };
  }

  private async timeZone(tx: TenantTx): Promise<string> {
    const garage = await tx.garage.findUniqueOrThrow({
      where: { id: this.db.garageId },
      select: { timezone: true },
    });
    return garage.timezone;
  }
}
