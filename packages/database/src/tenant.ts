import type { Prisma, PrismaClient } from './generated/prisma/client';

/** The client a tenant callback receives: every query in it is filtered by RLS. */
export type TenantTx = Prisma.TransactionClient;

export interface TenantTxOptions {
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` in one transaction that first sets app.garage_id (database.md section 6.3).
 * This is the only place that calls set_config. Use it with the gearva_app client:
 * RLS then hides every row of every other garage, even if a query forgets its filter.
 * One transaction per unit of work also lets later phases lock rows (invoice numbers).
 */
export function runAsTenant<T>(
  client: PrismaClient,
  garageId: string,
  fn: (tx: TenantTx) => Promise<T>,
  options?: TenantTxOptions,
): Promise<T> {
  if (!UUID.test(garageId)) {
    return Promise.reject(new Error('runAsTenant: garageId must be a UUID'));
  }
  return client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.garage_id', ${garageId}, true)`;
    return fn(tx);
  }, options);
}
