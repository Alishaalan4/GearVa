import { Module } from '@nestjs/common';
import { InvoiceChangesService } from './invoice-changes.service';
import { InvoiceReportsService } from './invoice-reports.service';
import { InvoiceSettingsService } from './invoice-settings.service';
import {
  DebtsController,
  IncomeController,
  InvoiceSettingsController,
  InvoicesController,
} from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  controllers: [InvoicesController, DebtsController, IncomeController, InvoiceSettingsController],
  providers: [
    InvoicesService,
    InvoiceChangesService,
    InvoiceReportsService,
    InvoiceSettingsService,
  ],
  exports: [InvoicesService],
})
export class InvoicesModule {}
