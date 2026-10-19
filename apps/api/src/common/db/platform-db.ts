import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@gearva/database';
import { PLATFORM_PRISMA } from './prisma.providers';

/**
 * gearva_platform access (database.md section 6.1). It bypasses RLS, so it is only for:
 * admin endpoints, credential lookups before a tenant is known, jobs that list garages,
 * and audit rows that belong to no garage. Reading a garage's records through it must
 * also write an admin_access_logs row (Phase 5).
 */
@Injectable()
export class PlatformDb {
  constructor(@Inject(PLATFORM_PRISMA) readonly client: PrismaClient) {}
}
