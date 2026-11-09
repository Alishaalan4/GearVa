import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type ExtendTrialInput,
  type RecordSubscriptionPaymentInput,
} from '@gearva/contracts';
import type { Garage, Prisma } from '@gearva/database';
import { RequestContext } from '../../common/context/request-context';
import { PlatformDb } from '../../common/db/platform-db';
import { AppException } from '../../common/errors/app-exception';

/** The last moment of a YYYY-MM-DD day (UTC), as for `paidUntil` at creation (flow.md 2.1). */
export const endOfDay = (date: string) => new Date(`${date}T23:59:59.999Z`);
const midday = (date: string) => new Date(`${date}T12:00:00.000Z`);
const dayOf = (at: Date) => at.toISOString().slice(0, 10);

function garageNotFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Garage not found');
}

/**
 * The subscription lifecycle (flow.md 11.1): payments and trial extensions. Each change
 * locks the garage row, so two admins recording at once cannot overwrite each other.
 */
@Injectable()
export class AdminSubscriptionsService {
  constructor(
    private readonly platformDb: PlatformDb,
    private readonly context: RequestContext,
  ) {}

  /**
   * flow.md 11.1: the payment row, then the garage is paid until the new expiry date and
   * ACTIVE, usable at once. A suspended garage stays suspended: suspension is a separate
   * decision, undone with Reactivate. The paid period starts where the current one ends
   * if it has not ended yet, else on the payment day (trial days are not added on top).
   */
  async recordPayment(garageId: string, input: RecordSubscriptionPaymentInput): Promise<void> {
    const adminId = this.context.actor?.id;
    if (!adminId) throw new Error('A payment needs an admin actor');
    await this.platformDb.client.$transaction(async (tx) => {
      const garage = await this.lockGarage(tx, garageId);
      const paidUntil = garage.isPaid && garage.expiresAt ? dayOf(garage.expiresAt) : null;
      const periodStart = paidUntil && paidUntil >= input.paidOn ? paidUntil : input.paidOn;
      if (input.newExpiryDate < periodStart) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.VALIDATION_FAILED,
          'The new expiry date is before the current paid period ends',
          { field: 'newExpiryDate', periodStart },
        );
      }
      await tx.subscriptionPayment.create({
        data: {
          garageId: garage.id,
          amountCents: input.amountCents,
          method: input.method,
          paidAt: midday(input.paidOn),
          periodStart: midday(periodStart),
          newExpiryDate: midday(input.newExpiryDate),
          extraBranches: input.extraBranches,
          recordedById: adminId,
          note: input.note ?? null,
        },
      });
      await tx.garage.update({
        where: { id: garage.id },
        data: {
          isPaid: true,
          expiresAt: endOfDay(input.newExpiryDate),
          ...(garage.status === 'SUSPENDED' ? {} : { status: 'ACTIVE' }),
        },
      });
    });
  }

  /**
   * flow.md 11.1: only a garage that has never paid, while on a trial (or after it ended).
   * The new last day must be later than the current one: a trial is never shortened here.
   */
  async extendTrial(garageId: string, input: ExtendTrialInput): Promise<void> {
    await this.platformDb.client.$transaction(async (tx) => {
      const garage = await this.lockGarage(tx, garageId);
      if (garage.isPaid || !garage.trialEndsAt) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.GARAGE_NOT_IN_TRIAL,
          'Only a garage that has never paid can have its trial extended',
        );
      }
      if (input.trialEndsOn <= dayOf(garage.trialEndsAt)) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.VALIDATION_FAILED,
          'The new trial end must be after the current one',
          { field: 'trialEndsOn' },
        );
      }
      await tx.garage.update({
        where: { id: garage.id },
        data: {
          trialEndsAt: endOfDay(input.trialEndsOn),
          ...(garage.status === 'SUSPENDED' ? {} : { status: 'TRIAL' }),
        },
      });
    });
  }

  private async lockGarage(tx: Prisma.TransactionClient, garageId: string): Promise<Garage> {
    await tx.$queryRaw`SELECT "id" FROM "garages" WHERE "id" = ${garageId}::uuid FOR UPDATE`;
    const garage = await tx.garage.findFirst({ where: { id: garageId, deletedAt: null } });
    if (!garage) throw garageNotFound();
    return garage;
  }
}
