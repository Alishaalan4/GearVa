import { Injectable } from '@nestjs/common';
import {
  type DebtItem,
  type InvoiceListItem,
  type InvoiceListQuery,
  type Paginated,
  type PaginationQuery,
  type PaymentMethod,
  type RevenuePeriod,
  type RevenueQuery,
  type RevenueReport,
  localDate,
} from '@gearva/contracts';
import { Prisma } from '@gearva/database';
import { RequestContext } from '../common/context/request-context';
import { TenantDb } from '../common/db/tenant-db';
import { paginated, toSkipTake } from '../common/pagination';
import { toCustomerSummary } from '../customers/mappers';
import { toInvoiceSummary } from './invoices.service';

/** Invoice list, debt list and the revenue report (flow.md 7.5, 8.2, 8.3). */
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

  /**
   * The Revenue page (flow.md 8.3, step 7.5): one day, month or year in the garage's
   * timezone. Invoiced = invoices issued in the period without cancelled ones; collected =
   * payments received in the period (also on invoices cancelled later: the money came in).
   * Queries run one after the other on the one transaction (TenantDb.run).
   */
  async revenue(query: RevenueQuery): Promise<RevenueReport> {
    const branchId = this.context.actor?.branchId ?? query.branchId ?? null;
    const garageId = this.db.garageId;
    return this.db.run(async (tx) => {
      const garage = await tx.garage.findUniqueOrThrow({
        where: { id: garageId },
        select: { timezone: true },
      });
      const tz = garage.timezone;
      const today = localDate(new Date(), tz);
      const { from, to } = periodBounds(query.period, query.date ?? today);
      const issuedDay = Prisma.sql`to_char(i."issued_at" AT TIME ZONE ${tz}, 'YYYY-MM-DD')`;
      const paidDay = Prisma.sql`to_char(p."paid_at" AT TIME ZONE ${tz}, 'YYYY-MM-DD')`;
      const branch = Prisma.sql`(${branchId}::uuid IS NULL OR i."branch_id" = ${branchId}::uuid)`;
      const invoicesInPeriod = Prisma.sql`
        i."garage_id" = ${garageId}::uuid AND i."status" <> 'CANCELLED'
        AND ${issuedDay} BETWEEN ${from} AND ${to} AND ${branch}`;

      const [totals] = await tx.$queryRaw<
        { n: bigint; invoiced: bigint | null; unpaid: bigint | null }[]
      >`
        SELECT count(*) AS n, sum(i."total_cents") AS invoiced, sum(i."remaining_cents") AS unpaid
        FROM "invoices" i WHERE ${invoicesInPeriod}`;

      const methods = await tx.$queryRaw<{ method: PaymentMethod; amount: bigint }[]>`
        SELECT p."method"::text AS method, sum(p."amount_cents") AS amount
        FROM "payments" p JOIN "invoices" i ON i."id" = p."invoice_id"
        WHERE p."garage_id" = ${garageId}::uuid AND ${paidDay} BETWEEN ${from} AND ${to}
          AND ${branch}
        GROUP BY p."method" ORDER BY amount DESC`;

      const services = await tx.$queryRaw<
        {
          id: string | null;
          name_en: string | null;
          name_ar: string | null;
          total: bigint;
          lines: bigint;
        }[]
      >`
        SELECT st."id", st."name_en", st."name_ar",
          sum(ii."total_cents") AS total, count(*) AS lines
        FROM "invoice_items" ii
        JOIN "invoices" i ON i."id" = ii."invoice_id"
        LEFT JOIN "service_records" sr ON sr."id" = ii."service_record_id"
        LEFT JOIN "service_types" st ON st."id" = sr."service_type_id"
        WHERE ii."garage_id" = ${garageId}::uuid AND ${invoicesInPeriod}
        GROUP BY st."id", st."name_en", st."name_ar"
        ORDER BY total DESC, st."name_en"`;

      const customers = await tx.$queryRaw<
        { id: string; name: string; phone: string; total: bigint; n: bigint }[]
      >`
        SELECT gc."id", gc."name", o."phone", sum(i."total_cents") AS total, count(*) AS n
        FROM "invoices" i
        JOIN "garage_customers" gc ON gc."id" = i."garage_customer_id"
        JOIN "owners" o ON o."id" = gc."owner_id"
        WHERE ${invoicesInPeriod}
        GROUP BY gc."id", gc."name", o."phone"
        ORDER BY total DESC, gc."id"
        LIMIT 5`;

      // A month shows its days, a year its months; one day has no series.
      const keyLength = query.period === 'MONTH' ? 10 : 7;
      let series: RevenueReport['series'] = [];
      if (query.period !== 'DAY') {
        const invoicedBy = await tx.$queryRaw<{ key: string; total: bigint }[]>`
          SELECT left(${issuedDay}, ${keyLength}) AS key, sum(i."total_cents") AS total
          FROM "invoices" i WHERE ${invoicesInPeriod} GROUP BY 1`;
        const collectedBy = await tx.$queryRaw<{ key: string; total: bigint }[]>`
          SELECT left(${paidDay}, ${keyLength}) AS key, sum(p."amount_cents") AS total
          FROM "payments" p JOIN "invoices" i ON i."id" = p."invoice_id"
          WHERE p."garage_id" = ${garageId}::uuid AND ${paidDay} BETWEEN ${from} AND ${to}
            AND ${branch}
          GROUP BY 1`;
        const inv = new Map(invoicedBy.map((r) => [r.key, Number(r.total)]));
        const col = new Map(collectedBy.map((r) => [r.key, Number(r.total)]));
        series = seriesKeys(query.period, from, to).map((key) => ({
          key,
          invoicedCents: inv.get(key) ?? 0,
          collectedCents: col.get(key) ?? 0,
        }));
      }

      const refunds = await tx.invoice.aggregate({
        where: {
          ...this.scope(),
          ...(branchId ? { branchId } : {}),
          status: 'CANCELLED',
          paidCents: { gt: 0 },
        },
        _sum: { paidCents: true },
      });

      const invoiceCount = Number(totals?.n ?? 0);
      const invoicedCents = Number(totals?.invoiced ?? 0);
      return {
        period: query.period,
        from,
        to,
        today,
        invoicedCents,
        collectedCents: methods.reduce((sum, m) => sum + Number(m.amount), 0),
        unpaidCents: Number(totals?.unpaid ?? 0),
        invoiceCount,
        averageInvoiceCents: invoiceCount ? Math.round(invoicedCents / invoiceCount) : 0,
        refundNeededCents: refunds._sum.paidCents ?? 0,
        byServiceType: services.map((r) => ({
          serviceTypeId: r.id,
          nameEn: r.name_en,
          nameAr: r.name_ar,
          totalCents: Number(r.total),
          lines: Number(r.lines),
        })),
        byMethod: methods.map((m) => ({ method: m.method, amountCents: Number(m.amount) })),
        topCustomers: customers.map((c) => ({
          customerId: c.id,
          name: c.name,
          phone: c.phone,
          invoicedCents: Number(c.total),
          invoiceCount: Number(c.n),
        })),
        series,
      };
    });
  }

  /** This garage; staff of one branch see only that branch (flow.md 1). */
  private scope() {
    const branchId = this.context.actor?.branchId;
    return { garageId: this.db.garageId, ...(branchId ? { branchId } : {}) };
  }
}

/** First and last day (YYYY-MM-DD, both included) of the period around `day`. */
export function periodBounds(period: RevenuePeriod, day: string): { from: string; to: string } {
  const [year, month] = day.split('-').map(Number) as [number, number];
  if (period === 'DAY') return { from: day, to: day };
  if (period === 'YEAR') return { from: `${year}-01-01`, to: `${year}-12-31` };
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, '0')}` };
}

/** Every day of a month, or every month of a year, so the chart has no gaps. */
function seriesKeys(period: RevenuePeriod, from: string, to: string): string[] {
  if (period === 'YEAR') {
    const year = from.slice(0, 4);
    return Array.from({ length: 12 }, (_, m) => `${year}-${String(m + 1).padStart(2, '0')}`);
  }
  const days = Number(to.slice(8, 10));
  return Array.from(
    { length: days },
    (_, d) => `${from.slice(0, 8)}${String(d + 1).padStart(2, '0')}`,
  );
}
