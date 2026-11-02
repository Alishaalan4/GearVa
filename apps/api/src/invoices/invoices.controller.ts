import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type DebtItem,
  type IncomeSummary,
  type InvoiceDetail,
  type InvoiceListItem,
  type InvoiceSettings,
  type Paginated,
  cancelInvoiceSchema,
  editInvoiceSchema,
  finishVisitSchema,
  incomeQuerySchema,
  invoiceListQuerySchema,
  recordPaymentSchema,
  updateInvoiceSettingsSchema,
} from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../audit/audit.decorator';
import { Roles } from '../auth/staff-access.decorators';
import { PaginationQueryDto } from '../common/pagination';
import { InvoiceChangesService } from './invoice-changes.service';
import { InvoiceReportsService } from './invoice-reports.service';
import { InvoiceSettingsService } from './invoice-settings.service';
import { InvoicesService } from './invoices.service';

class RecordPaymentDto extends createZodDto(recordPaymentSchema) {}
class EditInvoiceDto extends createZodDto(editInvoiceSchema) {}
class CancelInvoiceDto extends createZodDto(cancelInvoiceSchema) {}
class ReissueInvoiceDto extends createZodDto(finishVisitSchema) {}
class InvoiceListQueryDto extends createZodDto(invoiceListQuerySchema) {}
class IncomeQueryDto extends createZodDto(incomeQuerySchema) {}
class UpdateInvoiceSettingsDto extends createZodDto(updateInvoiceSettingsSchema) {}

/** Invoices come from "Finish visit" (flow.md 7.1); there is no route to create one. */
@Controller('v1/invoices')
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly changes: InvoiceChangesService,
    private readonly reports: InvoiceReportsService,
  ) {}

  @Get()
  @Roles('OWNER', 'MANAGER', 'RECEPTIONIST')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  list(@Query() query: InvoiceListQueryDto): Promise<Paginated<InvoiceListItem>> {
    return this.reports.list(query);
  }

  @Get(':invoiceId')
  detail(@Param('invoiceId', ParseUUIDPipe) invoiceId: string): Promise<InvoiceDetail> {
    return this.invoices.detail(invoiceId);
  }

  /** flow.md 7.5; who may edit when is decided in the service. */
  @Patch(':invoiceId')
  @Roles('OWNER', 'MANAGER', 'MECHANIC')
  @Audit('invoice.update', 'invoice')
  edit(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() body: EditInvoiceDto,
  ): Promise<InvoiceDetail> {
    return this.changes.edit(invoiceId, body);
  }

  @Post(':invoiceId/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER', 'MANAGER')
  @Audit('invoice.cancel', 'invoice')
  cancel(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() body: CancelInvoiceDto,
  ): Promise<InvoiceDetail> {
    return this.changes.cancel(invoiceId, body);
  }

  @Post(':invoiceId/reissue')
  @Roles('OWNER', 'MANAGER')
  @Audit('invoice.reissue', 'invoice')
  reissue(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() body: ReissueInvoiceDto,
  ): Promise<InvoiceDetail> {
    return this.changes.reissue(invoiceId, body);
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

/** flow.md 8.2 */
@Controller('v1/debts')
export class DebtsController {
  constructor(private readonly reports: InvoiceReportsService) {}

  @Get()
  @Roles('OWNER', 'MANAGER', 'RECEPTIONIST')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  list(@Query() query: PaginationQueryDto): Promise<Paginated<DebtItem>> {
    return this.reports.debts(query);
  }
}

/** flow.md 8.3 */
@Controller('v1/income')
export class IncomeController {
  constructor(private readonly reports: InvoiceReportsService) {}

  @Get()
  @Roles('OWNER', 'MANAGER')
  income(@Query() query: IncomeQueryDto): Promise<IncomeSummary> {
    return this.reports.income(query);
  }
}

@Controller('v1/invoice-settings')
export class InvoiceSettingsController {
  constructor(private readonly settings: InvoiceSettingsService) {}

  @Get()
  @Roles('OWNER')
  get(): Promise<InvoiceSettings> {
    return this.settings.get();
  }

  @Patch()
  @Roles('OWNER')
  @Audit('invoice_settings.update', 'garage_settings')
  update(@Body() body: UpdateInvoiceSettingsDto): Promise<InvoiceSettings> {
    return this.settings.update(body);
  }
}
