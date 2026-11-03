import { HttpStatus, Injectable } from '@nestjs/common';
import {
  DEFAULT_INVOICE_NUMBER_FORMAT,
  ERROR_CODES,
  type FinishVisitInput,
  type InvoiceDetail,
  type InvoiceSummary,
  type RecordPaymentInput,
  earliestNextDue,
  formatInvoiceNumber,
  invoicePaymentStatus,
  invoiceTotals,
  localDate,
} from '@gearva/contracts';
import type {
  Invoice,
  Payment,
  Prisma,
  ServiceRecord,
  ServiceType,
  TenantTx,
  User,
  Visit,
} from '@gearva/database';
import { RequestContext } from '../common/context/request-context';
import { TenantDb } from '../common/db/tenant-db';
import { AppException } from '../common/errors/app-exception';
import { fromDbDate, toDbDate } from '../maintenance/records.service';

/** Sums the optional labour or parts amounts; null when no line entered one. */
function optionalSum(values: (number | null)[]): number | null {
  const entered = values.filter((v) => v !== null);
  return entered.length > 0 ? entered.reduce((sum, v) => sum + v, 0) : null;
}

function serviceName(record: ServiceRecord & { serviceType: ServiceType }, locale: string) {
  const { nameEn, nameAr } = record.serviceType;
  return record.customName ?? (locale === 'en' ? nameEn : nameAr);
}

/** The brand and grade of a line, whichever detail field its service uses. */
function brandAndGrade(details: unknown): { brand: string | null; grade: string | null } {
  const d = details as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);
  return {
    brand: text(d.brand) ?? text(d.tireBrand) ?? text(d.padBrand),
    grade: text(d.grade),
  };
}

function exceedsRemaining(): AppException {
  return new AppException(
    HttpStatus.CONFLICT,
    ERROR_CODES.PAYMENT_EXCEEDS_REMAINING,
    'The payment is more than the amount remaining',
  );
}

export function toInvoiceSummary(invoice: Invoice): InvoiceSummary {
  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    totalCents: invoice.totalCents,
    paidCents: invoice.paidCents,
    remainingCents: invoice.remainingCents,
  };
}

type InvoiceWithRelations = Invoice & {
  items: Prisma.InvoiceItemGetPayload<{
    include: { serviceRecord: { include: { serviceType: true } } };
  }>[];
  payments: (Payment & { receivedBy: User })[];
};

/**
 * Invoices and payments (flow.md 7, 8). `issue` runs inside the visit's transaction, so a
 * failure leaves no invoice, no number used and no gap (flow.md 7.1).
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly db: TenantDb,
    private readonly context: RequestContext,
  ) {}

  /** flow.md 7.1. Returns the invoice and the payment taken while finishing, if any. */
  async issue(
    tx: TenantTx,
    visit: Visit,
    input: FinishVisitInput,
    replacesInvoiceId: string | null = null,
  ): Promise<{ invoice: Invoice; payment: Payment | null }> {
    const garageId = visit.garageId;
    const staffId = this.requireActorId();
    const records = await tx.serviceRecord.findMany({
      where: { visitId: visit.id, garageId },
      include: { serviceType: true },
      orderBy: [{ performedAt: 'asc' }, { createdAt: 'asc' }],
    });
    const settings = await tx.garageSettings.findUniqueOrThrow({ where: { garageId } });
    const vatRate = settings.vatEnabled ? (settings.vatRatePercent?.toString() ?? '0') : null;
    const totals = invoiceTotals({
      lineTotalsCents: records.map((r) => r.totalCents),
      discount: input.discount ?? null,
      vatRatePercent: vatRate,
    });
    if (totals.totalCents === 0 && !input.confirmFree) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.INVOICE_TOTAL_ZERO,
        'The total is 0: confirm that this work is free',
      );
    }

    const customer = await tx.garageCustomer.findFirstOrThrow({
      where: { id: visit.garageCustomerId, garageId },
      include: { owner: true },
    });
    const vehicle = await tx.vehicle.findFirstOrThrow({
      where: { id: visit.vehicleId, garageId },
    });
    const branch = await tx.branch.findFirstOrThrow({ where: { id: visit.branchId, garageId } });
    const garage = await tx.garage.findUniqueOrThrow({ where: { id: garageId } });

    const issuedAt = new Date();
    const year = Number(localDate(issuedAt, garage.timezone).slice(0, 4));
    const seq = await this.nextNumber(tx, visit, year);
    const number = formatInvoiceNumber(
      settings.invoiceNumberFormat || DEFAULT_INVOICE_NUMBER_FORMAT,
      { branchCode: branch.code, year, seq },
    );

    const locale = customer.owner.locale === 'en' ? 'en' : 'ar';
    const nextDue = earliestNextDue(
      records.map((r) => ({ nextDueKm: r.nextDueKm, nextDueDate: fromDbDate(r.nextDueDate) })),
    );
    const warranties = records
      .filter((r) => r.warrantyUntil)
      .map((r) => `${serviceName(r, locale)}: ${fromDbDate(r.warrantyUntil)}`);

    const invoice = await tx.invoice.create({
      data: {
        garageId,
        branchId: visit.branchId,
        visitId: visit.id,
        garageCustomerId: visit.garageCustomerId,
        ownerId: visit.ownerId,
        vehicleId: visit.vehicleId,
        number,
        seq,
        year,
        status: invoicePaymentStatus(totals.totalCents, 0),
        issuedAt,
        locale,
        ...totals,
        discountType: input.discount?.type ?? null,
        discountValue: input.discount?.value ?? null,
        vatRatePercent: settings.vatEnabled ? settings.vatRatePercent : null,
        remainingCents: totals.totalCents,
        laborCents: optionalSum(records.map((r) => r.laborCents)),
        partsCents: optionalSum(records.map((r) => r.partsCents)),
        nextServiceKm: nextDue.nextServiceKm,
        nextServiceDate: nextDue.nextServiceDate ? toDbDate(nextDue.nextServiceDate) : null,
        warrantyText: warranties.length > 0 ? warranties.join('\n') : null,
        termsSnapshot: settings.termsText,
        customerSnapshot: { name: customer.name, phone: customer.owner.phone },
        vehicleSnapshot: {
          plate: vehicle.plate,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          odometerKm: visit.odometerKm,
          distanceUnit: vehicle.distanceUnit,
        },
        garageSnapshot: {
          name: garage.name,
          phone: garage.phone,
          location: garage.locationText,
          branchName: branch.name,
          branchCode: branch.code,
          vatNumber: settings.vatEnabled ? settings.vatNumber : null,
          brandColor: settings.brandColor,
        },
        replacesInvoiceId,
        createdById: staffId,
      },
    });

    await tx.invoiceItem.createMany({
      data: records.map((r, position) => ({
        garageId,
        invoiceId: invoice.id,
        serviceRecordId: r.id,
        description: serviceName(r, locale),
        ...brandAndGrade(r.details),
        quantity: r.quantity,
        unitPriceCents: r.unitPriceCents,
        totalCents: r.totalCents,
        position,
      })),
    });

    // Free work has nothing to pay: a payment must be above 0.
    if (!input.payment || totals.totalCents === 0) return { invoice, payment: null };
    const amountCents = input.payment.amountCents ?? totals.totalCents;
    if (amountCents > totals.totalCents) throw exceedsRemaining();
    return this.applyPayment(tx, invoice, {
      amountCents,
      method: input.payment.method,
      paidAt: issuedAt,
      note: null,
    });
  }

  /** flow.md 8.1: POST /v1/invoices/:id/payments. */
  async recordPayment(invoiceId: string, input: RecordPaymentInput): Promise<InvoiceDetail> {
    await this.db.run(async (tx) => {
      const scope = this.invoiceScope(invoiceId);
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "invoices"
        WHERE "id" = ${invoiceId}::uuid AND "garage_id" = ${scope.garageId}::uuid
        FOR UPDATE`;
      if (locked.length === 0) throw this.notFound();
      const invoice = await tx.invoice.findFirst({ where: scope });
      if (!invoice) throw this.notFound();
      if (invoice.status === 'CANCELLED') {
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.INVOICE_CANCELLED,
          'This invoice is cancelled',
        );
      }
      if (input.amountCents > invoice.remainingCents) throw exceedsRemaining();
      await this.applyPayment(tx, invoice, {
        amountCents: input.amountCents,
        method: input.method,
        paidAt: await this.paidAt(tx, input.date),
        note: input.note ?? null,
      });
    });
    return this.detail(invoiceId);
  }

  async detail(invoiceId: string): Promise<InvoiceDetail> {
    const invoice = await this.db.run((tx) =>
      tx.invoice.findFirst({
        where: this.invoiceScope(invoiceId),
        include: {
          items: {
            include: { serviceRecord: { include: { serviceType: true } } },
            orderBy: { position: 'asc' },
          },
          payments: { include: { receivedBy: true }, orderBy: { paidAt: 'asc' } },
        },
      }),
    );
    if (!invoice) throw this.notFound();
    return this.toDetail(invoice);
  }

  /** The gap-free number (flow.md 7.1): the row lock serializes concurrent invoices. */
  private async nextNumber(tx: TenantTx, visit: Visit, year: number): Promise<number> {
    const rows = await tx.$queryRaw<{ last_number: number }[]>`
      INSERT INTO "invoice_counters" ("branch_id", "year", "garage_id", "last_number")
      VALUES (${visit.branchId}::uuid, ${year}, ${visit.garageId}::uuid, 1)
      ON CONFLICT ("branch_id", "year")
      DO UPDATE SET "last_number" = "invoice_counters"."last_number" + 1
      RETURNING "last_number"`;
    const seq = rows[0]?.last_number;
    if (seq === undefined) throw new Error('The invoice counter returned no number');
    return seq;
  }

  /** Inserts the payment and moves the totals together (database.md 4.5). */
  private async applyPayment(
    tx: TenantTx,
    invoice: Invoice,
    input: {
      amountCents: number;
      method: RecordPaymentInput['method'];
      paidAt: Date;
      note: string | null;
    },
  ): Promise<{ invoice: Invoice; payment: Payment }> {
    const payment = await tx.payment.create({
      data: {
        garageId: invoice.garageId,
        invoiceId: invoice.id,
        amountCents: input.amountCents,
        method: input.method,
        paidAt: input.paidAt,
        receivedById: this.requireActorId(),
        note: input.note,
      },
    });
    const paidCents = invoice.paidCents + input.amountCents;
    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        paidCents,
        remainingCents: invoice.totalCents - paidCents,
        status: invoicePaymentStatus(invoice.totalCents, paidCents),
      },
    });
    return { invoice: updated, payment };
  }

  /** Now for today; a past day is kept as that day, and a future day is refused. */
  private async paidAt(tx: TenantTx, date: string | undefined): Promise<Date> {
    const now = new Date();
    if (!date) return now;
    const garage = await tx.garage.findUniqueOrThrow({
      where: { id: this.db.garageId },
      select: { timezone: true },
    });
    const today = localDate(now, garage.timezone);
    if (date > today) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.BAD_REQUEST,
        'A payment date cannot be in the future',
      );
    }
    return date === today ? now : new Date(`${date}T12:00:00.000Z`);
  }

  /** An invoice of this garage; staff of one branch see only that branch (flow.md 1). */
  invoiceScope(invoiceId: string) {
    const branchId = this.context.actor?.branchId;
    return { id: invoiceId, garageId: this.db.garageId, ...(branchId ? { branchId } : {}) };
  }

  private requireActorId(): string {
    const id = this.context.actor?.id;
    if (!id) throw new Error('An invoice needs a signed-in staff member');
    return id;
  }

  notFound(): AppException {
    return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Invoice not found');
  }

  private toDetail(invoice: InvoiceWithRelations): InvoiceDetail {
    return {
      ...toInvoiceSummary(invoice),
      visitId: invoice.visitId,
      issuedAt: invoice.issuedAt.toISOString(),
      locale: invoice.locale,
      subtotalCents: invoice.subtotalCents,
      discountType: invoice.discountType,
      discountValue: invoice.discountValue,
      discountCents: invoice.discountCents,
      vatCents: invoice.vatCents,
      laborCents: invoice.laborCents,
      partsCents: invoice.partsCents,
      nextServiceKm: invoice.nextServiceKm,
      nextServiceDate: fromDbDate(invoice.nextServiceDate),
      warrantyText: invoice.warrantyText,
      terms: invoice.termsSnapshot,
      customer: invoice.customerSnapshot as unknown as InvoiceDetail['customer'],
      vehicle: invoice.vehicleSnapshot as unknown as InvoiceDetail['vehicle'],
      garage: invoice.garageSnapshot as unknown as InvoiceDetail['garage'],
      items: invoice.items.map((item) => ({
        id: item.id,
        description: item.description,
        serviceName:
          item.serviceRecord && !item.serviceRecord.customName
            ? {
                en: item.serviceRecord.serviceType.nameEn,
                ar: item.serviceRecord.serviceType.nameAr,
              }
            : null,
        brand: item.brand,
        grade: item.grade,
        quantity: item.quantity.toFixed(2),
        unitPriceCents: item.unitPriceCents,
        totalCents: item.totalCents,
      })),
      payments: invoice.payments.map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        method: p.method,
        paidAt: p.paidAt.toISOString(),
        note: p.note,
        receivedBy: { id: p.receivedBy.id, name: p.receivedBy.name },
      })),
      cancelledAt: invoice.cancelledAt?.toISOString() ?? null,
      cancelReason: invoice.cancelReason,
      replacesInvoiceId: invoice.replacesInvoiceId,
    };
  }
}
