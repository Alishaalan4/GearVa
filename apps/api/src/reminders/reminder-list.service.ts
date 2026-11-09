import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type DueReminderItem,
  ERROR_CODES,
  type MarkWhatsappSentResponse,
  type Paginated,
  type PaginationQuery,
} from '@gearva/contracts';
import { TenantDb } from '../common/db/tenant-db';
import { AppException } from '../common/errors/app-exception';
import { paginated, toSkipTake } from '../common/pagination';
import { fromDbDate } from '../maintenance/records.service';
import {
  type DueReminder,
  KINDS,
  REMINDER_REF,
  RemindersService,
  localeOf,
} from './reminders.service';

export function reminderNotFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Reminder not found');
}

/**
 * The WhatsApp list (flow.md 9.5): due reminders that email has not reached, and
 * "mark as sent", which counts the round like a sent email does.
 */
@Injectable()
export class ReminderListService {
  constructor(
    private readonly db: TenantDb,
    private readonly reminders: RemindersService,
  ) {}

  /**
   * Due reminders whose customer has no email, or whose email of this round failed or
   * was skipped. A customer with an email whose email is waiting or sent is left out,
   * so they never get the same round twice.
   */
  async due(query: PaginationQuery): Promise<Paginated<DueReminderItem>> {
    const garageId = this.db.garageId;
    const due = await this.reminders.dueNow();
    const { garage, emails } = await this.db.run(async (tx) => ({
      garage: await tx.garage.findUniqueOrThrow({
        where: { id: garageId },
        select: { name: true },
      }),
      emails: await tx.notification.findMany({
        where: {
          garageId,
          dedupeKey: {
            in: due
              .filter((d) => d.customer.email)
              .map((d) => `REMINDER:${d.reminder.id}:${d.round}:EMAIL`),
          },
        },
        select: { refId: true, status: true },
      }),
    }));
    const emailStatus = new Map(emails.map((e) => [e.refId, e.status]));
    const open = due.filter((d) => {
      if (!d.customer.email) return true;
      const status = emailStatus.get(d.reminder.id);
      return status === 'FAILED' || status === 'SKIPPED';
    });
    const { skip, take } = toSkipTake(query);
    const items = open
      .slice(skip, skip + take)
      .map((d) => this.toItem(d, garage.name, Boolean(d.customer.email)));
    return paginated(items, open.length, query);
  }

  /**
   * Staff sent the round on WhatsApp: a SENT WhatsApp row in the log, and the round
   * counted. A round already counted (by email or an earlier click) changes nothing.
   */
  async markWhatsappSent(reminderId: string, round: number): Promise<MarkWhatsappSentResponse> {
    const garageId = this.db.garageId;
    const counted = await this.db.run(async (tx) => {
      const reminder = await tx.reminder.findFirst({
        where: { id: reminderId, garageId, vehicle: { deletedAt: null } },
        include: { vehicle: { include: { customer: { include: { owner: true } } } } },
      });
      if (!reminder) throw reminderNotFound();
      if (reminder.notifyCount >= round) return false;
      if (
        reminder.notifyCount !== round - 1 ||
        (reminder.status !== 'ACTIVE' && reminder.status !== 'SENT')
      ) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.REMINDER_NOT_DUE,
          'This reminder round is not due',
        );
      }
      const { customer } = reminder.vehicle;
      const now = new Date();
      await tx.notification.createMany({
        data: [
          {
            garageId,
            channel: 'WHATSAPP',
            type: KINDS[reminder.kind].type,
            template: 'whatsapp-by-staff',
            locale: localeOf(customer.owner),
            recipient: customer.owner.phone,
            payload: { round },
            status: 'SENT',
            sentAt: now,
            dedupeKey: `REMINDER:${reminder.id}:${round}:WHATSAPP`,
            ownerId: customer.ownerId,
            refType: REMINDER_REF,
            refId: reminder.id,
          },
        ],
        skipDuplicates: true,
      });
      return this.reminders.countRound(tx, reminder.id, round);
    });
    return { id: reminderId, round, counted };
  }

  private toItem(d: DueReminder, garageName: string, hasEmail: boolean): DueReminderItem {
    const { reminder, vehicle, customer } = d;
    const custom = reminder.sourceRecord.customName;
    return {
      reminderId: reminder.id,
      round: d.round,
      kind: reminder.kind,
      customer: { id: customer.id, name: customer.name, phone: customer.owner.phone },
      vehicle: {
        id: vehicle.id,
        plate: vehicle.plate,
        make: vehicle.make,
        model: vehicle.model,
        distanceUnit: vehicle.distanceUnit,
      },
      serviceName: custom
        ? { en: custom, ar: custom }
        : { en: reminder.serviceType?.nameEn ?? '', ar: reminder.serviceType?.nameAr ?? '' },
      dueKm: reminder.kind === 'SERVICE_DUE' ? reminder.nextDueKm : null,
      dueDate: fromDbDate(reminder.nextDueDate),
      estimatedKm: d.estimatedKm,
      lastNotifiedAt: reminder.lastNotifiedAt?.toISOString() ?? null,
      emailFailed: hasEmail,
      whatsappUrl: this.reminders.whatsappUrl(d, garageName),
    };
  }
}
