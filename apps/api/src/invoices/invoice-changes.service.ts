import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type CancelInvoiceInput,
  type EditInvoiceInput,
  ERROR_CODES,
  type FinishVisitInput,
  type InvoiceDetail,
  invoicePaymentStatus,
  invoiceTotals,
  lineTotalCents,
  localDate,
} from '@gearva/contracts';
import type { Invoice, TenantTx } from '@gearva/database';
import { AuditService } from '../audit/audit.service';
import { RequestContext } from '../common/context/request-context';
import { TenantDb } from '../common/db/tenant-db';
import { AppException } from '../common/errors/app-exception';
import { InvoicesService } from './invoices.service';

function cancelledError(): AppException {
  return new AppException(
    HttpStatus.CONFLICT,
    ERROR_CODES.INVOICE_CANCELLED,
    'This invoice is cancelled',
  );
}

/** Editing, cancelling and reissuing (flow.md 7.5). Nothing here ever deletes an invoice. */
@Injectable()
export class InvoiceChangesService {
  constructor(
    private readonly db: TenantDb,
    private readonly context: RequestContext,
    private readonly invoices: InvoicesService,
    private readonly audit: AuditService,
  ) {}

  /**
   * New quantities, prices or discount. The service record moves with its line, so history
   * and invoice agree. Lines are not added or removed: that is cancel and reissue.
   */
  async edit(invoiceId: string, input: EditInvoiceInput): Promise<InvoiceDetail> {
    const change = await this.db.run(async (tx) => {
      const invoice = await this.lock(tx, invoiceId);
      if (invoice.status === 'CANCELLED') throw cancelledError();
      await this.assertMayEdit(tx, invoice);

      const items = await tx.invoiceItem.findMany({
        where: { invoiceId, garageId: invoice.garageId },
        orderBy: { position: 'asc' },
      });
      const lines = items.map((item) => {
        const change = input.items?.find((c) => c.id === item.id);
        const quantity = change?.quantity ?? item.quantity.toFixed(2);
        const unitPriceCents = change?.unitPriceCents ?? item.unitPriceCents;
        return {
          item,
          quantity: String(quantity),
          unitPriceCents,
          totalCents: lineTotalCents(quantity, unitPriceCents),
        };
      });
      const known = new Set(items.map((item) => item.id));
      if (input.items?.some((c) => !known.has(c.id))) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.BAD_REQUEST,
          'A line does not belong to this invoice',
        );
      }

      const discount =
        input.discount === undefined
          ? invoice.discountType
            ? { type: invoice.discountType, value: invoice.discountValue ?? 0 }
            : null
          : input.discount;
      const totals = invoiceTotals({
        lineTotalsCents: lines.map((l) => l.totalCents),
        discount,
        // The rate of the invoice, not today's: a garage may have changed it since.
        vatRatePercent: invoice.vatRatePercent?.toString() ?? null,
      });
      if (totals.totalCents < invoice.paidCents) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.INVOICE_TOTAL_BELOW_PAID,
          'The new total is less than what was already paid',
        );
      }
      if (totals.totalCents === 0 && !input.confirmFree) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.INVOICE_TOTAL_ZERO,
          'The total is 0: confirm that this work is free',
        );
      }

      for (const { item, quantity, unitPriceCents, totalCents } of lines) {
        await tx.invoiceItem.update({
          where: { id: item.id },
          data: { quantity, unitPriceCents, totalCents },
        });
        if (item.serviceRecordId) {
          await tx.serviceRecord.update({
            where: { id: item.serviceRecordId },
            data: { quantity, unitPriceCents, totalCents },
          });
        }
      }
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          ...totals,
          discountType: discount?.type ?? null,
          discountValue: discount?.value ?? null,
          remainingCents: totals.totalCents - invoice.paidCents,
          status: invoicePaymentStatus(totals.totalCents, invoice.paidCents),
          lastEditedById: this.actor().id,
        },
      });
      return {
        before: {
          subtotalCents: invoice.subtotalCents,
          discountCents: invoice.discountCents,
          vatCents: invoice.vatCents,
          totalCents: invoice.totalCents,
          items: items.map((i) => ({
            id: i.id,
            quantity: i.quantity.toFixed(2),
            unitPriceCents: i.unitPriceCents,
          })),
        },
        after: {
          ...totals,
          items: lines.map((l) => ({
            id: l.item.id,
            quantity: l.quantity,
            unitPriceCents: l.unitPriceCents,
          })),
        },
      };
    });
    await this.audit.record({
      action: 'invoice.edit',
      entityType: 'invoice',
      entityId: invoiceId,
      ...change,
    });
    return this.invoices.detail(invoiceId);
  }

  /** Keeps the number and every payment; those show as "refund needed" (flow.md 7.5). */
  async cancel(invoiceId: string, input: CancelInvoiceInput): Promise<InvoiceDetail> {
    await this.db.run(async (tx) => {
      const invoice = await this.lock(tx, invoiceId);
      if (invoice.status === 'CANCELLED') throw cancelledError();
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: input.reason,
          cancelledById: this.actor().id,
        },
      });
    });
    return this.invoices.detail(invoiceId);
  }

  /** A new invoice, with the next number, from the visit of a cancelled one. */
  async reissue(invoiceId: string, input: FinishVisitInput): Promise<InvoiceDetail> {
    const issued = await this.db.run(async (tx) => {
      const garageId = this.db.garageId;
      const scope = this.invoices.invoiceScope(invoiceId);
      const cancelled = await tx.invoice.findFirst({ where: scope });
      if (!cancelled) throw this.invoices.notFound();
      // The visit row serializes two reissues of its invoices.
      await tx.$queryRaw`
        SELECT "id" FROM "visits"
        WHERE "id" = ${cancelled.visitId}::uuid AND "garage_id" = ${garageId}::uuid
        FOR UPDATE`;
      const invoice = await this.lock(tx, invoiceId);
      if (invoice.status !== 'CANCELLED') {
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.INVOICE_NOT_CANCELLED,
          'Cancel the invoice before issuing a new one',
        );
      }
      const active = await tx.invoice.count({
        where: { visitId: invoice.visitId, garageId, status: { not: 'CANCELLED' } },
      });
      if (active > 0) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.INVOICE_ALREADY_REISSUED,
          'This visit already has an active invoice',
        );
      }
      const visit = await tx.visit.findFirstOrThrow({
        where: { id: invoice.visitId, garageId },
      });
      return this.invoices.issue(tx, visit, input, invoice.id);
    });
    if (issued.payment) {
      await this.audit.record({
        action: 'payment.create',
        entityType: 'invoice',
        entityId: issued.invoice.id,
        after: { amountCents: issued.payment.amountCents, method: issued.payment.method },
      });
    }
    return this.invoices.detail(issued.invoice.id);
  }

  /** flow.md 1, 7.5: the owner always; others on the day of issue, a mechanic own visits only. */
  private async assertMayEdit(tx: TenantTx, invoice: Invoice): Promise<void> {
    const actor = this.actor();
    if (actor.role === 'OWNER') return;
    if (actor.role === 'MECHANIC') {
      const visit = await tx.visit.findFirstOrThrow({
        where: { id: invoice.visitId, garageId: invoice.garageId },
      });
      if (visit.mechanicId !== actor.id) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          ERROR_CODES.FORBIDDEN,
          'You can only edit invoices of your own visits',
        );
      }
    }
    const garage = await tx.garage.findUniqueOrThrow({
      where: { id: invoice.garageId },
      select: { timezone: true },
    });
    const sameDay =
      localDate(invoice.issuedAt, garage.timezone) === localDate(new Date(), garage.timezone);
    if (!sameDay) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.INVOICE_EDIT_WINDOW_CLOSED,
        'After the day of issue, only the owner can edit an invoice',
      );
    }
  }

  /** The invoice, locked for this transaction. */
  private async lock(tx: TenantTx, invoiceId: string): Promise<Invoice> {
    const scope = this.invoices.invoiceScope(invoiceId);
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "invoices"
      WHERE "id" = ${invoiceId}::uuid AND "garage_id" = ${scope.garageId}::uuid
      FOR UPDATE`;
    if (locked.length === 0) throw this.invoices.notFound();
    const invoice = await tx.invoice.findFirst({ where: scope });
    if (!invoice) throw this.invoices.notFound();
    return invoice;
  }

  private actor() {
    const actor = this.context.actor;
    if (!actor?.id) throw new Error('An invoice change needs a signed-in staff member');
    return { ...actor, id: actor.id };
  }
}
