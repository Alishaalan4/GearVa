import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { FilesModule } from '../files/files.module';
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
import { InvoicePdfQueue } from './pdf/invoice-pdf.queue';
import { InvoicePdfService } from './pdf/invoice-pdf.service';
import {
  PDF_RENDERER,
  type PdfRenderer,
  PuppeteerPdfRenderer,
  StubPdfRenderer,
} from './pdf/pdf-renderer';

@Module({
  imports: [FilesModule],
  controllers: [InvoicesController, DebtsController, IncomeController, InvoiceSettingsController],
  providers: [
    InvoicesService,
    InvoiceChangesService,
    InvoiceReportsService,
    InvoiceSettingsService,
    InvoicePdfQueue,
    InvoicePdfService,
    {
      provide: PDF_RENDERER,
      inject: [ENV],
      useFactory: (env: Env): PdfRenderer =>
        env.PDF_ADAPTER === 'stub' ? new StubPdfRenderer() : new PuppeteerPdfRenderer(),
    },
  ],
  exports: [InvoicesService, InvoicePdfService],
})
export class InvoicesModule {}
