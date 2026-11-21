import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

/**
 * Prisma's defaults (a transaction may run 5 s, and waits 2 s for a connection) are too
 * tight for a small server under load: "Finish visit" writes the visit, its records, the
 * invoice and the notifications in one transaction, and on a busy machine (the free
 * Render plan, or CI running every test file at once) it passed 5 s now and then and
 * answered 500 (step 7.1). A normal request still takes milliseconds; these limits only
 * stop a slow moment from failing.
 */
export const TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

/**
 * Creates a Prisma client for one database role (database.md section 6.1).
 * The API never queries tenant tables with a bare client: it goes through the
 * tenant wrapper `runAsTenant`, which sets app.garage_id first (section 6.3).
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    transactionOptions: TRANSACTION_OPTIONS,
  });
}
