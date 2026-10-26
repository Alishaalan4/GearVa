import { Inject, Injectable } from '@nestjs/common';
import {
  runAsTenant,
  type PrismaClient,
  type TenantTx,
  type TenantTxOptions,
} from '@gearva/database';
import { RequestContext } from '../context/request-context';
import { APP_PRISMA } from './prisma.providers';

/**
 * The only way garage code reaches tenant tables (README section 5.1, items 3-4).
 * The garage comes from the request context, never from the caller.
 * Services still filter by garageId in their queries (first line of defense);
 * RLS inside this transaction is the second.
 */
@Injectable()
export class TenantDb {
  constructor(
    @Inject(APP_PRISMA) private readonly client: PrismaClient,
    private readonly context: RequestContext,
  ) {}

  /** The current garage id, for the explicit `where: { garageId }` filters. */
  get garageId(): string {
    return this.context.requireGarageId();
  }

  /**
   * Runs `fn` in one tenant transaction. A transaction has one connection, so queries
   * inside it run one after the other: never `Promise.all` on `tx` (pg is removing
   * support for overlapping queries on one client).
   */
  run<T>(fn: (tx: TenantTx) => Promise<T>, options?: TenantTxOptions): Promise<T> {
    return runAsTenant(this.client, this.context.requireGarageId(), fn, options);
  }
}
