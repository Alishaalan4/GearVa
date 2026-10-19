import { Injectable } from '@nestjs/common';
import type { Prisma } from '@gearva/database';
import { RequestContext } from '../common/context/request-context';
import { PlatformDb } from '../common/db/platform-db';
import { TenantDb } from '../common/db/tenant-db';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  /** Admin/system actions only: the garage the action touched, if any. */
  garageId?: string | null;
}

/**
 * Writes audit_logs rows (database.md section 4.6). The interceptor calls it for every
 * mutating request; services call it directly for edits that need before/after.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly context: RequestContext,
    private readonly tenantDb: TenantDb,
    private readonly platformDb: PlatformDb,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    const actor = this.context.actor;
    if (!actor) throw new Error('Cannot write an audit row without an actor');

    const data = {
      actorType: actor.type,
      actorId: actor.id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before,
      after: entry.after,
      ip: this.context.ip ?? null,
      userAgent: this.context.userAgent ?? null,
    };

    if (actor.type === 'STAFF') {
      // Garage staff: always their own garage, through RLS.
      await this.tenantDb.run((tx) =>
        tx.auditLog.create({ data: { ...data, garageId: this.tenantDb.garageId } }),
      );
      return;
    }

    // Admin and system actions may touch no garage at all, so they go through the
    // platform role (database.md section 4.6).
    await this.platformDb.client.auditLog.create({
      data: { ...data, garageId: entry.garageId ?? actor.garageId },
    });
  }
}
