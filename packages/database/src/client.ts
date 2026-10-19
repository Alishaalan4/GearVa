import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

/**
 * Creates a Prisma client for one database role (database.md section 6.1).
 * The API never queries tenant tables with a bare client: it goes through the
 * tenant wrapper, which sets app.garage_id first (section 6.3, added in step 1.2).
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
