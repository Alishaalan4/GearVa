import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import {
  estimateCurrentKm,
  fromKm,
  localDate,
  localMonth,
  monthStart,
  nextDaytimeStart,
  reminderRound,
  type SystemSettings,
} from '@gearva/contracts';
import type {
  Garage,
  GarageCustomer,
  NotificationType,
  Owner,
  Reminder,
  ServiceType,
  TenantTx,
  Vehicle,
} from '@gearva/database';
import { ClsService } from 'nestjs-cls';
import { RequestContext } from '../common/context/request-context';
import { PlatformDb } from '../common/db/platform-db';
import { TenantDb } from '../common/db/tenant-db';
import { garageLockReason } from '../common/garage-lock';
import { ENV, type Env } from '../config/env';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { fromDbDate } from '../maintenance/records.service';
import type { Locale } from '../notifications/notification-channel';
import { whatsappReminderText } from '../notifications/templates/reminders';
import { NotificationsService, type NewNotification } from '../notifications/notifications.service';
import type { ScheduledJob } from '../common/jobs/scheduled-job';

/** A due reminder with what its message needs (flow.md 9.1). */
export interface DueReminder {
  reminder: Reminder & {
    serviceType: ServiceType | null;
    sourceRecord: { customName: string | null };
  };
  /** the round to send: notifyCount + 1 */
  round: number;
  /** the car's estimated km now (flow.md 5.2) */
  estimatedKm: number;
  vehicle: Vehicle;
  customer: GarageCustomer & { owner: Owner };
}

export interface ScanResult {
  /** reminder emails queued by this scan */
  emailed: number;
  /** monthly reminder emails queued by this scan */
  monthly: number;
}

export const REMINDER_REF = 'reminder';

/** The hourly reminder scan job (flow.md 9.1). */
export const REMINDER_SCAN_JOB = Symbol('REMINDER_SCAN_JOB');

/** How each reminder kind is logged and which email it uses. */
export const KINDS: Record<Reminder['kind'], { type: NotificationType; template: string }> = {
  SERVICE_DUE: { type: 'SERVICE_REMINDER', template: 'service-reminder' },
  WARRANTY_END: { type: 'WARRANTY_END', template: 'warranty-end' },
  RECOMMENDED_NEXT: { type: 'SERVICE_REMINDER', template: 'recommended-next' },
};

export const localeOf = (owner: Owner): Locale => (owner.locale === 'en' ? 'en' : 'ar');

/**
 * Reminders (flow.md 9): the hourly scan finds due reminders and emails the customers the
 * garage has an email for; the rest are for the WhatsApp list (9.5, step 4.4). A round
 * counts once it is sent: an email marked SENT, or staff marking the WhatsApp message.
 */
@Injectable()
export class RemindersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly db: TenantDb,
    private readonly platform: PlatformDb,
    private readonly notifications: NotificationsService,
    @Inject(REMINDER_SCAN_JOB) private readonly scanJob: ScheduledJob,
    private readonly cls: ClsService,
    private readonly context: RequestContext,
    @Inject(ENV) private readonly env: Env,
    private readonly systemSettings: SystemSettingsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.notifications.onSent(REMINDER_REF, async (tx, notification) => {
      const round = (notification.payload as { round?: unknown } | null)?.round;
      if (notification.refId && typeof round === 'number') {
        await this.countRound(tx, notification.refId, round);
      }
    });
    // Off in tests, which run scans themselves.
    if (this.env.SCHEDULED_JOBS === 'on') await this.scanJob.start(() => this.scanAll());
  }

  /**
   * The hourly job: each garage that is not locked, in its own tenant context. One
   * garage failing does not stop the others.
   */
  async scanAll(now = new Date()): Promise<void> {
    const garages = await this.platform.client.garage.findMany({
      where: { deletedAt: null },
      select: { id: true, status: true, isPaid: true, trialEndsAt: true, expiresAt: true },
    });
    for (const garage of garages) {
      if (garageLockReason(garage, now)) continue;
      try {
        await this.inGarage(garage.id, () => this.scanGarage(now));
      } catch (error) {
        this.logger.error(
          `Reminder scan of garage ${garage.id} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /** Runs `fn` as the SYSTEM actor of one garage, like the notification worker. */
  inGarage<T>(garageId: string, fn: () => Promise<T>): Promise<T> {
    return this.cls.run(() => {
      this.context.setActor({ type: 'SYSTEM', id: null, garageId, role: null, branchId: null });
      return fn();
    });
  }

  /** flow.md 9.1-9.4 for the current garage. Outside its daytime window, only stuck rows. */
  async scanGarage(now = new Date()): Promise<ScanResult> {
    await this.notifications.requeueStuck();
    const garageId = this.db.garageId;
    const garage = await this.db.run((tx) =>
      tx.garage.findUniqueOrThrow({ where: { id: garageId } }),
    );
    const system = await this.systemSettings.get();
    const window = {
      startHour: system.reminderDaytimeStartHour,
      endHour: system.reminderDaytimeEndHour,
    };
    if (nextDaytimeStart(now, garage.timezone, window)) return { emailed: 0, monthly: 0 };

    const due = await this.db.run((tx) => this.findDue(tx, garage, now, system));
    const emails = due.filter((d) => d.customer.email).map((d) => this.reminderEmail(d, garage));
    const emailed = await this.recordNew(emails);
    const monthly = await this.recordNew(await this.monthlyEmails(garage, now));
    return { emailed, monthly };
  }

  /** The due reminders of the current garage: for the scan, and the WhatsApp list (9.5). */
  async dueNow(now = new Date()): Promise<DueReminder[]> {
    const garageId = this.db.garageId;
    const system = await this.systemSettings.get();
    return this.db.run(async (tx) => {
      const garage = await tx.garage.findUniqueOrThrow({ where: { id: garageId } });
      return this.findDue(tx, garage, now, system);
    });
  }

  /**
   * flow.md 9.1: the reminders of this garage that are due now, with the round to send.
   * Opted-out and deleted customers and deleted cars are left out.
   */
  private async findDue(
    tx: TenantTx,
    garage: Pick<Garage, 'id' | 'timezone'>,
    now: Date,
    system: SystemSettings,
  ): Promise<DueReminder[]> {
    const settings = await tx.garageSettings.findUniqueOrThrow({ where: { garageId: garage.id } });
    const reminders = await tx.reminder.findMany({
      where: {
        garageId: garage.id,
        status: { in: ['ACTIVE', 'SENT'] },
        vehicle: { deletedAt: null, customer: { deletedAt: null, remindersOptOut: false } },
      },
      include: {
        serviceType: true,
        sourceRecord: { select: { customName: true } },
        vehicle: { include: { customer: { include: { owner: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const today = localDate(now, garage.timezone);
    const due: DueReminder[] = [];
    for (const { vehicle, ...reminder } of reminders) {
      const estimatedKm = estimateCurrentKm({
        currentKm: vehicle.currentKm,
        lastOdometerAt: vehicle.lastOdometerAt,
        avgDailyKm: vehicle.avgDailyKm === null ? null : Number(vehicle.avgDailyKm),
        garageDefaultDailyKm: settings.defaultDailyKm,
        systemDefaultDailyKm: system.defaultDailyKm,
        now,
      });
      const round = reminderRound(
        { ...reminder, nextDueDate: fromDbDate(reminder.nextDueDate) },
        {
          estimatedKm,
          today,
          leadKm: settings.reminderLeadKm,
          leadDays: settings.reminderLeadDays,
          now,
          followUps: system.reminderFollowUps,
          followUpDays: system.reminderFollowUpDays,
        },
      );
      if (round === null) continue;
      const { customer, ...car } = vehicle;
      due.push({ reminder, round, estimatedKm, vehicle: car as Vehicle, customer });
    }
    return due;
  }

  /**
   * Counts a round as sent (flow.md 9.1), in the transaction that marked it sent. Only
   * the round that is next counts, and only while the reminder is open, so a late or
   * repeated call changes nothing.
   */
  async countRound(tx: TenantTx, reminderId: string, round: number): Promise<boolean> {
    const { count } = await tx.reminder.updateMany({
      where: {
        id: reminderId,
        garageId: this.db.garageId,
        notifyCount: round - 1,
        status: { in: ['ACTIVE', 'SENT'] },
      },
      data: { notifyCount: round, lastNotifiedAt: new Date(), status: 'SENT' },
    });
    return count === 1;
  }

  /** The name of the reminder's service in the customer's language. */
  serviceName(due: DueReminder): string {
    const { serviceType, sourceRecord } = due.reminder;
    if (sourceRecord.customName) return sourceRecord.customName;
    if (!serviceType) return '';
    return localeOf(due.customer.owner) === 'en' ? serviceType.nameEn : serviceType.nameAr;
  }

  /** flow.md 9.5: a wa.me link with the message written in the customer's language. */
  whatsappUrl(due: DueReminder, garageName: string): string {
    const { reminder, vehicle, customer } = due;
    const text = whatsappReminderText(
      reminder.kind,
      {
        customerName: customer.name,
        garageName,
        vehicle: `${vehicle.make} ${vehicle.model}`,
        plate: vehicle.plate,
        serviceName: this.serviceName(due),
        dueKm:
          reminder.kind === 'SERVICE_DUE' && reminder.nextDueKm !== null
            ? Math.round(fromKm(reminder.nextDueKm, vehicle.distanceUnit))
            : null,
        unit: vehicle.distanceUnit,
        dueDate: fromDbDate(reminder.nextDueDate),
      },
      localeOf(customer.owner),
    );
    return `https://wa.me/${customer.owner.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
  }

  private reminderEmail(due: DueReminder, garage: Pick<Garage, 'id' | 'name'>): NewNotification {
    const { reminder, round, vehicle, customer } = due;
    const kind = KINDS[reminder.kind];
    const dueDate = fromDbDate(reminder.nextDueDate);
    const base = {
      round,
      customerName: customer.name,
      garageName: garage.name,
      vehicle: `${vehicle.make} ${vehicle.model}`,
      plate: vehicle.plate,
      serviceName: this.serviceName(due),
    };
    return {
      garageId: garage.id,
      channel: 'EMAIL',
      type: kind.type,
      template: kind.template,
      locale: localeOf(customer.owner),
      recipient: customer.email,
      payload:
        reminder.kind === 'SERVICE_DUE'
          ? {
              ...base,
              dueKm:
                reminder.nextDueKm === null
                  ? null
                  : Math.round(fromKm(reminder.nextDueKm, vehicle.distanceUnit)),
              unit: vehicle.distanceUnit,
              dueDate,
            }
          : { ...base, dueDate },
      dedupeKey: `REMINDER:${reminder.id}:${round}:EMAIL`,
      ownerId: customer.ownerId,
      refType: REMINDER_REF,
      refId: reminder.id,
    };
  }

  /**
   * flow.md 9.2: when the garage turned it on, once a month to each customer with an
   * email who has not opted out and has not received a reminder this month.
   */
  private async monthlyEmails(
    garage: Pick<Garage, 'id' | 'name' | 'timezone'>,
    now: Date,
  ): Promise<NewNotification[]> {
    const month = localMonth(now, garage.timezone);
    const since = monthStart(now, garage.timezone);
    return this.db.run(async (tx) => {
      const settings = await tx.garageSettings.findUniqueOrThrow({
        where: { garageId: garage.id },
      });
      if (!settings.monthlyReminderEnabled) return [];
      const customers = await tx.garageCustomer.findMany({
        where: {
          garageId: garage.id,
          deletedAt: null,
          remindersOptOut: false,
          email: { not: null },
        },
        include: { owner: true },
      });
      const reminded = await tx.notification.findMany({
        where: {
          garageId: garage.id,
          type: { in: ['SERVICE_REMINDER', 'WARRANTY_END'] },
          status: 'SENT',
          sentAt: { gte: since },
          ownerId: { not: null },
        },
        select: { ownerId: true },
        distinct: ['ownerId'],
      });
      const remindedOwners = new Set(reminded.map((n) => n.ownerId));
      return customers
        .filter((c) => !remindedOwners.has(c.ownerId))
        .map((c) => ({
          garageId: garage.id,
          channel: 'EMAIL' as const,
          type: 'MONTHLY_REMINDER' as const,
          template: 'monthly-reminder',
          locale: localeOf(c.owner),
          recipient: c.email,
          payload: { customerName: c.name, garageName: garage.name },
          dedupeKey: `MONTHLY_REMINDER:${c.id}:${month}`,
          ownerId: c.ownerId,
          refType: 'garage_customer',
          refId: c.id,
        }));
    });
  }

  /**
   * Records and queues the notifications whose dedupe key is new. Keys already in the log
   * are left out first, so an hourly scan writes nothing for what it already did; the
   * unique key still guards two scans running at once.
   */
  private async recordNew(inputs: NewNotification[]): Promise<number> {
    const garageId = this.db.garageId;
    let queued = 0;
    for (let i = 0; i < inputs.length; i += 200) {
      const chunk = inputs.slice(i, i + 200);
      const existing = await this.db.run((tx) =>
        tx.notification.findMany({
          where: { garageId, dedupeKey: { in: chunk.map((n) => n.dedupeKey) } },
          select: { dedupeKey: true },
        }),
      );
      const known = new Set(existing.map((n) => n.dedupeKey));
      for (const input of chunk.filter((n) => !known.has(n.dedupeKey))) {
        const { notification, created } = await this.db.run((tx) =>
          this.notifications.record(tx, input),
        );
        if (!created) continue;
        await this.notifications.dispatch(notification);
        queued++;
      }
    }
    return queued;
  }
}
