import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@gearva/contracts';
import {
  type PrismaClient,
  type TenantTx,
  type TenantTxOptions,
  runAsOwner,
} from '@gearva/database';
import { RequestContext } from '../context/request-context';
import { AppException } from '../errors/app-exception';
import { APP_PRISMA } from './prisma.providers';

/**
 * The owner app's way to the garages' tables (database.md 6.4): gearva_app with
 * app.owner_id from the signed-in owner (OwnerGuard), never from the request. Services
 * still filter by ownerId (first line); the owner_* RLS policies are the second.
 */
@Injectable()
export class OwnerDb {
  constructor(
    @Inject(APP_PRISMA) private readonly client: PrismaClient,
    private readonly context: RequestContext,
  ) {}

  /** The signed-in owner's id. Throws when the request has no owner actor. */
  get ownerId(): string {
    const actor = this.context.actor;
    if (actor?.type !== 'OWNER' || !actor.id) {
      throw new AppException(HttpStatus.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Not signed in');
    }
    return actor.id;
  }

  /** One owner transaction. As with TenantDb, never `Promise.all` on `tx`. */
  run<T>(fn: (tx: TenantTx) => Promise<T>, options?: TenantTxOptions): Promise<T> {
    return runAsOwner(this.client, this.ownerId, fn, options);
  }
}
