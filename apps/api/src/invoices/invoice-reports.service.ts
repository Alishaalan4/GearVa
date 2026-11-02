import { Injectable } from '@nestjs/common';
import {
  type DebtItem,
  type IncomeQuery,
  type IncomeSummary,
  type InvoiceListItem,
  type InvoiceListQuery,
  type Paginated,
  type PaginationQuery,
  localDate,
} from '@gearva/contracts';
import type { Prisma, TenantTx } from '@gearva/database';
import { RequestContext } from '../common/context/request-context';
import { TenantDb } from '../common/db/tenant-db';
import { paginated, toSkipTake } from '../common/pagination';
import { toCustomerSummary } from '../customers/mappers';
import { toInvoiceSummary } from './invoices.service';

/** Invoice list, debt list and income summary (flow.md 7.5, 8.2, 8.3). */
@Injectable()
export class InvoiceReportsService {
  constructor(
    private readonly db: TenantDb,
    private readonly context: RequestContext,
  ) {}

  async list(query: InvoiceListQuery): Promise<Paginated<InvoiceListItem>> {
    const where: Prisma.InvoiceWhereInput = {
      ...this.scope(),
      ...(query.status ? { status: query.status } : {}),
      // Money was taken on an invoice that no longer stands (flow.md 7.5).
      ...(query.refundNeeded ? { status: 'CANCELLED', paidCents: { gt: 0 } } : {}),
    };
    return this.db.run(async (tx) => {
      const total = await tx.invoice.count({ where });
      const invoices = await tx.invoice.findMany({
        where,
        include: { customer: true, vehicle: true },
        orderBy: { issuedAt: 'desc' },
        ...toSkipTake(query),
      });
      const items = invoices.map((i) => ({
        ...toInvoiceSummary(i),
        issuedAt: i.issuedAt.toISOString(),
        customerName: i.customer.name,
        plate: i.vehicle.plate,
      }));
      return paginated(items, total, query);
    });
  }

  /** Customers who owe money, the largest debt first (flow.md 8.2). */
  async debts(query: PaginationQuery): Promise<Paginated<DebtItem>> {
    const where: Prisma.InvoiceWhereInput = {
      ...this.scope(),
      status: { in: ['UNPAID', 'PARTIALLY_PAID'] },
    };
    return this.db.run(async (tx) => {
      const everyone = await tx.invoice.findMany({
        where,
        distinct: ['garageCustomerId'],
        select: { garageCustomerId: true },
      });
      const groups = await tx.invoice.groupBy({
        by: ['garageCustomerId'],
        where,
        _sum: { remainingCents: true },
        orderBy: [{ _sum: { remainingCents: 'desc' } }, { garageCustomerId: 'asc' }],
        ...toSkipTake(query),
      });
      const ids = groups.map((g) => g.garageCustomerId);
      const customers = await tx.garageCustomer.findMany({
        where: { id: { in: ids }, garageId: this.db.garageId },
        include: { owner: true },
      });
      const invoices = await tx.invoice.findMany({
        where: { ...where, garageCustomerId: { in: ids } },
        include: { vehicle: true },
        orderBy: { issuedAt: 'asc' },
      });
      const items = groups.flatMap((group) => {
        const customer = customers.find((c) => c.id === group.garageCustomerId);
        if (!customer) return [];
        return [
          {
            customer: toCustomerSummary(customer),
            remainingCents: group._sum.remainingCents ?? 0,
            invoices: invoices
              .filter((i) => i.garageCustomerId === group.garageCustomerId)
              .map((i) => ({
                ...toInvoiceSummary(i),
                issuedAt: i.issuedAt.toISOString(),
                plate: i.vehicle.plate,
              })),
          },
        ];
      });
      return paginated(items, everyone.length, query);
    });
  }

  /** Today and this month in the garage's timezone (flow.md 8.3). */
  async income(query: IncomeQuery): Promise<IncomeSummary> {
    const branchId = this.context.actor?.branchId ?? query.branchId ?? null;
    return this.db.run(async (tx) => {
      const garage = await tx.garage.findUniqueOrThrow({
        where: { id: this.db.garageId },
        select: { timezone: true },
      });
      const today = localDate(new Date(), garage.timezone);
      const month = today.slice(0, 7);
      const received = await this.received(tx, garage.timezone, today, month, branchId);
      const invoiced = await this.invoiced(tx, garage.timezone, today, month, branchId);
      const refunds = await tx.invoice.aggregate({
        where: {
          ...this.scope(),
          ...(branchId ? { branchId } : {}),
          status: 'CANCELLED',
          paidCents: { gt: 0 },
        },
        _sum: { paidCents: true },
      });
      return {
        date: today,
        today: { receivedCents: received.today, invoicedCents: invoiced.today },
        month: { receivedCents: received.month, invoicedCents: invoiced.month },
        refundNeededCents: refunds._sum.paidCents ?? 0,
      };
    });
  }

  private async received(
    tx: TenantTx,
    timeZone: string,
    today: string,
    month: string,
    branchId: string | null,
  ) {
    const rows = await tx.$queryRaw<{ today: bigint | null; month: bigint | null }[]>`
      SELECT
        SUM(p."amount_cents") FILTER (WHERE d.day = ${today}) AS today,
        SUM(p."amount_cents") AS month
      FROM "payments" p
      JOIN "invoices" i ON i."id" = p."invoice_id"
      CROSS JOIN LATERAL (
        SELECT to_char(p."paid_at" AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day
      ) d
      WHERE p."garage_id" = ${this.db.garageId}::uuid
        AND left(d.day, 7) = ${month}
        AND (${branchId}::uuid IS NULL OR i."branch_id" = ${branchId}::uuid)`;
    return { today: Number(rows[0]?.today ?? 0), month: Number(rows[0]?.month ?? 0) };
  }

  private async invoiced(
    tx: TenantTx,
    timeZone: string,
    today: string,
    month: string,
    branchId: string | null,
  ) {
    const rows = await tx.$queryRaw<{ today: bigint | null; month: bigint | null }[]>`
      SELECT
        SUM(i."total_cents") FILTER (WHERE d.day = ${today}) AS today,
        SUM(i."total_cents") AS month
      FROM "invoices" i
      CROSS JOIN LATERAL (
        SELECT to_char(i."issued_at" AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day
      ) d
      WHERE i."garage_id" = ${this.db.garageId}::uuid
        AND i."status" <> 'CANCELLED'
        AND left(d.day, 7) = ${month}
        AND (${branchId}::uuid IS NULL OR i."branch_id" = ${branchId}::uuid)`;
    return { today: Number(rows[0]?.today ?? 0), month: Number(rows[0]?.month ?? 0) };
  }

  /** This garage; staff of one branch see only that branch (flow.md 1). */
  private scope() {
    const branchId = this.context.actor?.branchId;
    return { garageId: this.db.garageId, ...(branchId ? { branchId } : {}) };
  }
}
