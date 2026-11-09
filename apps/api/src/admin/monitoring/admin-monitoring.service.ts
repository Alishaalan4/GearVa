import { Injectable } from '@nestjs/common';
import {
  type BusinessView,
  type ExpiringGarages,
  type ExpiringQuery,
  type FailedMessage,
  type FailuresQuery,
  GARAGE_STATUSES,
  type GarageStatus,
  type GarageUsage,
  type MonitoredGarage,
  type Paginated,
  SUBSCRIPTION_PAYMENT_METHODS,
  type SubscriptionPaymentMethod,
  type UsageQuery,
} from '@gearva/contracts';
import type { Garage, Prisma } from '@gearva/database';
import { PlatformDb } from '../../common/db/platform-db';
import { paginated, toSkipTake } from '../../common/pagination';

const DAY = 24 * 60 * 60 * 1000;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
/** The first instant of the UTC month of `at`, `monthsBack` months earlier. */
const utcMonthStart = (at: Date, monthsBack = 0) =>
  new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - monthsBack, 1));
const monthKey = (at: Date) => at.toISOString().slice(0, 7);

/**
 * Admin monitoring and the business view (flow.md 11.2, 11.5). Everything here is a count
 * or a garage's account data, read with the platform role: the admin never sees a
 * garage's customers, cars or message recipients (flow.md 12), so no access log is needed.
 */
@Injectable()
export class AdminMonitoringService {
  constructor(private readonly platformDb: PlatformDb) {}

  /** flow.md 11.2: paid periods ending within `paidDays`, trials within `trialDays`. */
  async expiring(query: ExpiringQuery, now = new Date()): Promise<ExpiringGarages> {
    const db = this.platformDb.client;
    const [paid, trials] = [
      await db.garage.findMany({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          isPaid: true,
          expiresAt: { gte: now, lte: new Date(now.getTime() + query.paidDays * DAY) },
        },
        orderBy: { expiresAt: 'asc' },
      }),
      await db.garage.findMany({
        where: {
          deletedAt: null,
          status: 'TRIAL',
          isPaid: false,
          trialEndsAt: { gte: now, lte: new Date(now.getTime() + query.trialDays * DAY) },
        },
        orderBy: { trialEndsAt: 'asc' },
      }),
    ];
    const usage = await this.usageOf(
      [...paid, ...trials].map((g) => g.id),
      now,
    );
    return {
      paid: paid.map((g) => this.monitored(g, usage)),
      trials: trials.map((g) => this.monitored(g, usage)),
    };
  }

  /**
   * flow.md 11.2: every garage with its counts, newest first. `inactiveDays` keeps the
   * garages where nobody signed in and no visit was recorded for that many days.
   */
  async usage(query: UsageQuery, now = new Date()): Promise<Paginated<MonitoredGarage>> {
    const db = this.platformDb.client;
    const where: Prisma.GarageWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.paid ? { isPaid: query.paid === 'true' } : {}),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    if (query.inactiveDays) {
      const cutoff = new Date(now.getTime() - query.inactiveDays * DAY);
      where.AND = [
        { OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: cutoff } }] },
        { visits: { none: { openedAt: { gte: cutoff } } } },
      ];
    }
    const garages = await db.garage.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...toSkipTake(query),
    });
    const total = await db.garage.count({ where });
    const usage = await this.usageOf(
      garages.map((g) => g.id),
      now,
    );
    return paginated(
      garages.map((g) => this.monitored(g, usage)),
      total,
      query,
    );
  }

  /** flow.md 11.2: which messages failed and why; never to whom or what they said. */
  async failures(query: FailuresQuery): Promise<Paginated<FailedMessage>> {
    const db = this.platformDb.client;
    const where: Prisma.NotificationWhereInput = {
      status: 'FAILED',
      ...(query.garageId ? { garageId: query.garageId } : {}),
    };
    const rows = await db.notification.findMany({
      where,
      select: {
        id: true,
        type: true,
        channel: true,
        error: true,
        createdAt: true,
        garage: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...toSkipTake(query),
    });
    const total = await db.notification.count({ where });
    return paginated(
      rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      total,
      query,
    );
  }

  /** flow.md 11.5: subscription revenue per month and year, and how many garages. */
  async business(now = new Date()): Promise<BusinessView> {
    const db = this.platformDb.client;
    const since = utcMonthStart(now, 11);
    const lastYearStart = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
    const thisYearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

    const payments = await db.subscriptionPayment.findMany({
      where: { paidAt: { gte: since < lastYearStart ? since : lastYearStart } },
      select: { amountCents: true, paidAt: true, method: true },
    });
    const newGarages = await db.garage.findMany({
      where: { deletedAt: null, createdAt: { gte: since } },
      select: { createdAt: true },
    });
    const statuses = await db.garage.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const paidCount = await db.garage.count({ where: { deletedAt: null, isPaid: true } });
    const allCount = await db.garage.count({ where: { deletedAt: null } });

    const months = Array.from({ length: 12 }, (_, i) => ({
      month: monthKey(utcMonthStart(now, 11 - i)),
      revenueCents: 0,
      payments: 0,
      newGarages: 0,
    }));
    const byMonth = new Map(months.map((m) => [m.month, m]));
    const byMethod = Object.fromEntries(SUBSCRIPTION_PAYMENT_METHODS.map((m) => [m, 0])) as Record<
      SubscriptionPaymentMethod,
      number
    >;
    let revenueThisYearCents = 0;
    let revenueLastYearCents = 0;
    for (const p of payments) {
      const month = byMonth.get(monthKey(p.paidAt));
      if (month) {
        month.revenueCents += p.amountCents;
        month.payments += 1;
      }
      if (p.paidAt >= thisYearStart) {
        revenueThisYearCents += p.amountCents;
        byMethod[p.method] += p.amountCents;
      } else if (p.paidAt >= lastYearStart) {
        revenueLastYearCents += p.amountCents;
      }
    }
    for (const g of newGarages) {
      const month = byMonth.get(monthKey(g.createdAt));
      if (month) month.newGarages += 1;
    }
    const byStatus = Object.fromEntries(GARAGE_STATUSES.map((s) => [s, 0])) as Record<
      GarageStatus,
      number
    >;
    for (const s of statuses) byStatus[s.status] = s._count._all;

    return {
      months,
      revenueThisYearCents,
      revenueLastYearCents,
      byStatus,
      paid: paidCount,
      unpaid: allCount - paidCount,
      byMethod,
    };
  }

  private monitored(g: Garage, usage: Map<string, GarageUsage & { branches: number }>) {
    const { branches, ...counts } = usage.get(g.id) ?? emptyUsage(g);
    return {
      id: g.id,
      name: g.name,
      status: g.status,
      isPaid: g.isPaid,
      trialEndsAt: iso(g.trialEndsAt),
      expiresAt: iso(g.expiresAt),
      branchCount: branches,
      usage: counts,
    } satisfies MonitoredGarage;
  }

  /** The counts of these garages, in a few grouped queries (not one per garage). */
  private async usageOf(
    ids: string[],
    now: Date,
  ): Promise<Map<string, GarageUsage & { branches: number }>> {
    const result = new Map<string, GarageUsage & { branches: number }>();
    if (ids.length === 0) return result;
    const db = this.platformDb.client;
    const month = utcMonthStart(now);
    const inIds = { garageId: { in: ids } };

    const garages = await db.garage.findMany({
      where: { id: { in: ids } },
      select: { id: true, lastLoginAt: true },
    });
    const branches = await db.branch.groupBy({
      by: ['garageId'],
      where: { ...inIds, isActive: true },
      _count: { _all: true },
    });
    const customers = await db.garageCustomer.groupBy({
      by: ['garageId'],
      where: { ...inIds, deletedAt: null },
      _count: { _all: true },
    });
    const vehicles = await db.vehicle.groupBy({
      by: ['garageId'],
      where: { ...inIds, deletedAt: null },
      _count: { _all: true },
    });
    const invoices = await db.invoice.groupBy({
      by: ['garageId'],
      where: { ...inIds, issuedAt: { gte: month }, status: { not: 'CANCELLED' } },
      _count: { _all: true },
    });
    const messages = await db.notification.groupBy({
      by: ['garageId', 'channel', 'status'],
      where: { ...inIds, createdAt: { gte: month }, channel: { in: ['EMAIL', 'WHATSAPP'] } },
      _count: { _all: true },
    });
    const visits = await db.visit.groupBy({
      by: ['garageId'],
      where: inIds,
      _max: { openedAt: true },
    });

    const count = (rows: { garageId: string; _count: { _all: number } }[], id: string) =>
      rows.find((r) => r.garageId === id)?._count._all ?? 0;
    const message = (id: string, channel: string, status: string) =>
      messages.find((m) => m.garageId === id && m.channel === channel && m.status === status)
        ?._count._all ?? 0;
    for (const g of garages) {
      result.set(g.id, {
        branches: count(branches, g.id),
        customers: count(customers, g.id),
        vehicles: count(vehicles, g.id),
        invoicesThisMonth: count(invoices, g.id),
        emailsSent: message(g.id, 'EMAIL', 'SENT'),
        emailsFailed: message(g.id, 'EMAIL', 'FAILED'),
        whatsappSent: message(g.id, 'WHATSAPP', 'SENT'),
        lastLoginAt: iso(g.lastLoginAt),
        lastVisitAt: iso(visits.find((v) => v.garageId === g.id)?._max.openedAt),
      });
    }
    return result;
  }
}

function emptyUsage(g: Garage): GarageUsage & { branches: number } {
  return {
    branches: 0,
    customers: 0,
    vehicles: 0,
    invoicesThisMonth: 0,
    emailsSent: 0,
    emailsFailed: 0,
    whatsappSent: 0,
    lastLoginAt: iso(g.lastLoginAt),
    lastVisitAt: null,
  };
}
