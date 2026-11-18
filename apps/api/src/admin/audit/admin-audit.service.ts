import { Injectable } from '@nestjs/common';
import type {
  AccessLogItem,
  AccessLogQuery,
  AuditLogItem,
  AuditLogQuery,
  Paginated,
} from '@gearva/contracts';
import type { Prisma } from '@gearva/database';
import { RequestContext } from '../../common/context/request-context';
import { PlatformDb } from '../../common/db/platform-db';
import { paginated, toSkipTake } from '../../common/pagination';
import { requireSuperAdmin } from '../admin-roles';
import { adminDayRange } from '../admin-time';

/**
 * The super admin's audit log (flow.md 11.10, step 5.10): every recorded action of
 * admins, garage staff, car owners and Gearva's own jobs, across all garages, and the
 * "View as" access log. Read only; super admins only. The rows are written by the
 * AuditInterceptor and AuditService (database.md 4.6), never changed.
 */
@Injectable()
export class AdminAuditService {
  constructor(
    private readonly platformDb: PlatformDb,
    private readonly context: RequestContext,
  ) {}

  private get db() {
    return this.platformDb.client;
  }

  async list(query: AuditLogQuery): Promise<Paginated<AuditLogItem>> {
    requireSuperAdmin(this.context);
    const q = query.q?.trim();
    const where: Prisma.AuditLogWhereInput = {
      actorType: query.actorType,
      actorId: query.actorId,
      garageId: query.garageId,
      ...(q ? { action: { contains: q, mode: 'insensitive' } } : {}),
      createdAt: adminDayRange(query.from, query.to),
    };
    const [rows, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        include: { garage: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(query),
      }),
      this.db.auditLog.count({ where }),
    ]);

    // The people behind the rows, by kind (an actor id points to one of three tables).
    const idsOf = (type: string) => [
      ...new Set(rows.flatMap((r) => (r.actorType === type && r.actorId ? [r.actorId] : []))),
    ];
    const [admins, staff, owners] = await Promise.all([
      this.db.adminUser.findMany({
        where: { id: { in: idsOf('ADMIN') } },
        select: { id: true, name: true, email: true },
      }),
      this.db.user.findMany({
        where: { id: { in: idsOf('STAFF') } },
        select: { id: true, name: true, email: true },
      }),
      this.db.owner.findMany({
        where: { id: { in: idsOf('OWNER') } },
        select: { id: true, name: true, email: true },
      }),
    ]);
    const people = new Map<string, { id: string; name: string; email: string | null }>();
    for (const p of [...admins, ...staff, ...owners]) people.set(p.id, p);

    const items = rows.map((r): AuditLogItem => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      actorType: r.actorType,
      actor: r.actorId ? (people.get(r.actorId) ?? null) : null,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      garage: r.garage,
      before: r.before,
      after: r.after,
      ip: r.ip,
    }));
    return paginated(items, total, query);
  }

  async accessLog(query: AccessLogQuery): Promise<Paginated<AccessLogItem>> {
    requireSuperAdmin(this.context);
    const where: Prisma.AdminAccessLogWhereInput = {
      adminId: query.adminId,
      garageId: query.garageId,
      createdAt: adminDayRange(query.from, query.to),
    };
    const [rows, total] = await Promise.all([
      this.db.adminAccessLog.findMany({
        where,
        include: {
          admin: { select: { id: true, name: true } },
          garage: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(query),
      }),
      this.db.adminAccessLog.count({ where }),
    ]);
    const items = rows.map((r): AccessLogItem => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      admin: r.admin,
      garage: r.garage,
      action: r.action,
      path: r.path,
      ip: r.ip,
    }));
    return paginated(items, total, query);
  }
}
