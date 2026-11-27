import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  WHATSAPP_TEMPLATES,
  type WhatsappMessages,
  type WhatsappSentInput,
  type WhatsappSentResponse,
  type WhatsappTemplate,
} from '@gearva/contracts';
import type { NotificationType, TenantTx } from '@gearva/database';
import { RequestContext } from '../common/context/request-context';
import { TenantDb } from '../common/db/tenant-db';
import { AppException } from '../common/errors/app-exception';
import {
  type WhatsappMessageData,
  whatsappMessageText,
} from '../notifications/templates/whatsapp-messages';
import { localeOf } from '../reminders/reminders.service';
import { customerNotFound } from './customers.service';

/** How each ready message is filed in the notification log. */
const LOG: Record<WhatsappTemplate, { type: NotificationType; template: string }> = {
  CAR_READY: { type: 'CAR_READY', template: 'whatsapp-car-ready' },
  INVOICE_READY: { type: 'INVOICE', template: 'whatsapp-invoice' },
  PAYMENT_DUE: { type: 'PAYMENT_REMINDER', template: 'whatsapp-payment-due' },
  SERVICE_DUE: { type: 'SERVICE_REMINDER', template: 'whatsapp-service-due' },
  THANK_YOU: { type: 'MESSAGE', template: 'whatsapp-thank-you' },
  FREE: { type: 'MESSAGE', template: 'whatsapp-free' },
};

/** The car and invoice templates need a visit; the others work from the customer alone. */
const VISIT_ONLY: readonly WhatsappTemplate[] = ['CAR_READY', 'INVOICE_READY'];

function visitNotFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Visit not found');
}

function templateNotAvailable(): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    ERROR_CODES.VALIDATION_FAILED,
    'This message does not fit this customer or visit',
  );
}

/**
 * Step 7.10 (flow.md 9.7): "Message on WhatsApp". Gearva writes the ready messages in the
 * customer's language; staff choose one, may change it, and send it from their own
 * WhatsApp (a wa.me link). Opening WhatsApp is logged as a SENT WhatsApp row, like "Mark
 * as sent" on the reminder list (9.5): Gearva trusts the button, and the log never keeps
 * the text.
 */
@Injectable()
export class WhatsappService {
  constructor(
    private readonly db: TenantDb,
    private readonly context: RequestContext,
  ) {}

  async messages(customerId: string, visitId?: string): Promise<WhatsappMessages> {
    const { customer, data, available } = await this.db.run((tx) =>
      this.load(tx, customerId, visitId),
    );
    const locale = localeOf(customer.owner);
    return {
      phone: customer.owner.phone.replace(/\D/g, ''),
      locale,
      messages: available.map((template) => ({
        template,
        text: whatsappMessageText(template, data, locale),
      })),
    };
  }

  async sent(customerId: string, input: WhatsappSentInput): Promise<WhatsappSentResponse> {
    const garageId = this.db.garageId;
    const notificationId = await this.db.run(async (tx) => {
      const { customer, available } = await this.load(tx, customerId, input.visitId);
      if (!available.includes(input.template)) throw templateNotAvailable();
      const log = LOG[input.template];
      const row = await tx.notification.create({
        data: {
          garageId,
          channel: 'WHATSAPP',
          type: log.type,
          template: log.template,
          locale: localeOf(customer.owner),
          recipient: customer.owner.phone,
          payload: { template: input.template },
          status: 'SENT',
          sentAt: new Date(),
          // every click is its own message
          dedupeKey: `WHATSAPP:${randomUUID()}`,
          ownerId: customer.ownerId,
          refType: input.visitId ? 'visit' : 'customer',
          refId: input.visitId ?? customer.id,
        },
      });
      return row.id;
    });
    return { id: customerId, notificationId };
  }

  /** The customer, the visit's car and invoice, what they owe, and the templates that fit. */
  private async load(tx: TenantTx, customerId: string, visitId?: string) {
    const garageId = this.db.garageId;
    const customer = await tx.garageCustomer.findFirst({
      where: { id: customerId, garageId, deletedAt: null },
      include: { owner: true, garage: { select: { name: true } } },
    });
    if (!customer) throw customerNotFound();

    let car: WhatsappMessageData['car'] = null;
    let invoice: WhatsappMessageData['invoice'] = null;
    if (visitId) {
      const visit = await tx.visit.findFirst({
        where: { id: visitId, garageId, garageCustomerId: customer.id },
        include: { vehicle: true },
      });
      if (!visit) throw visitNotFound();
      car = { vehicle: `${visit.vehicle.make} ${visit.vehicle.model}`, plate: visit.vehicle.plate };
      const found = await tx.invoice.findFirst({
        where: { garageId, visitId: visit.id, status: { not: 'CANCELLED' } },
      });
      if (found) {
        invoice = {
          number: found.number,
          totalCents: found.totalCents,
          remainingCents: found.remainingCents,
        };
      }
    }

    // What they owe, as the debts list counts it (staff of one branch see that branch).
    const branchId = this.context.actor?.branchId;
    const owed = await tx.invoice.aggregate({
      where: {
        garageId,
        garageCustomerId: customer.id,
        status: { in: ['UNPAID', 'PARTIALLY_PAID'] },
        ...(branchId ? { branchId } : {}),
      },
      _sum: { remainingCents: true },
    });
    const owedCents = owed._sum.remainingCents ?? 0;

    const available = WHATSAPP_TEMPLATES.filter((t) => {
      if (VISIT_ONLY.includes(t) && !visitId) return false;
      if (t === 'INVOICE_READY') return invoice !== null;
      if (t === 'PAYMENT_DUE') return owedCents > 0;
      // a customer who asked for no reminders is not sent one by hand either
      if (t === 'SERVICE_DUE') return !customer.remindersOptOut;
      return true;
    });
    const data: WhatsappMessageData = {
      customerName: customer.name,
      garageName: customer.garage.name,
      car,
      invoice,
      owedCents,
    };
    return { customer, data, available };
  }
}
