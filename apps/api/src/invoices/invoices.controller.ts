import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { type InvoiceDetail, recordPaymentSchema } from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../audit/audit.decorator';
import { Roles } from '../auth/staff-access.decorators';
import { InvoicesService } from './invoices.service';

class RecordPaymentDto extends createZodDto(recordPaymentSchema) {}

/** Invoices come from "Finish visit" (flow.md 7.1); there is no route to create one. */
@Controller('v1/invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get(':invoiceId')
  detail(@Param('invoiceId', ParseUUIDPipe) invoiceId: string): Promise<InvoiceDetail> {
    return this.invoices.detail(invoiceId);
  }

  /** A mechanic records a payment only while finishing a visit (flow.md 1, 7.1). */
  @Post(':invoiceId/payments')
  @Roles('OWNER', 'MANAGER', 'RECEPTIONIST')
  @Audit('payment.create', 'invoice')
  recordPayment(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() body: RecordPaymentDto,
  ): Promise<InvoiceDetail> {
    return this.invoices.recordPayment(invoiceId, body);
  }
}
