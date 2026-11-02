import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ERROR_CODES } from '@gearva/contracts';
import { ClsService } from 'nestjs-cls';
import { AuditService } from '../../audit/audit.service';
import { RequestContext } from '../../common/context/request-context';
import { TenantDb } from '../../common/db/tenant-db';
import { AppException } from '../../common/errors/app-exception';
import { FILE_STORAGE, type FileStorage } from '../../files/file-storage';
import { InvoicesService } from '../invoices.service';
import { renderInvoiceHtml } from './invoice-html';
import { InvoicePdfQueue } from './invoice-pdf.queue';
import { PDF_RENDERER, type PdfRenderer } from './pdf-renderer';

/**
 * flow.md 7.2: a job renders the PDF after the transaction commits, and again whenever
 * what it prints changes (an edit, a payment, a cancel). One invoice keeps one file.
 */
@Injectable()
export class InvoicePdfService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InvoicePdfService.name);

  constructor(
    private readonly queue: InvoicePdfQueue,
    private readonly invoices: InvoicesService,
    private readonly db: TenantDb,
    private readonly cls: ClsService,
    private readonly context: RequestContext,
    private readonly audit: AuditService,
    @Inject(PDF_RENDERER) private readonly renderer: PdfRenderer,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  onApplicationBootstrap(): void {
    // Like notifications: a SYSTEM actor in the invoice's garage, so RLS still applies.
    this.queue.startWorker((job) =>
      this.cls.run(async () => {
        this.context.setActor({
          type: 'SYSTEM',
          id: null,
          garageId: job.garageId,
          role: null,
          branchId: null,
        });
        await this.generate(job.invoiceId);
      }),
    );
  }

  /** After commit. A lost job is not an error: the next download queues it again. */
  async queueRender(invoiceId: string): Promise<void> {
    try {
      await this.queue.add({ invoiceId, garageId: this.db.garageId });
    } catch (error) {
      this.logger.error(`Could not queue the PDF of invoice ${invoiceId}`, error as Error);
    }
  }

  async generate(invoiceId: string): Promise<void> {
    const invoice = await this.invoices.detail(invoiceId);
    const garageId = this.db.garageId;
    const pdf = await this.renderer.render(
      renderInvoiceHtml({
        invoice,
        logoDataUrl: await this.logoDataUrl(),
        fontCss: this.renderer.fontCss(),
      }),
    );
    const storageKey = `garages/${garageId}/invoices/${invoiceId}.pdf`;
    await this.storage.put(storageKey, pdf, 'application/pdf');
    await this.db.run(async (tx) => {
      const row = await tx.invoice.findFirstOrThrow({ where: { id: invoiceId, garageId } });
      if (row.pdfFileId) {
        await tx.file.update({ where: { id: row.pdfFileId }, data: { sizeBytes: pdf.length } });
        return;
      }
      const file = await tx.file.create({
        data: {
          garageId,
          kind: 'INVOICE_PDF',
          storageKey,
          mimeType: 'application/pdf',
          sizeBytes: pdf.length,
          createdById: row.createdById,
        },
      });
      await tx.invoice.update({ where: { id: invoiceId }, data: { pdfFileId: file.id } });
    });
  }

  /** GET /v1/invoices/:id/pdf. Reprinting is audit logged (flow.md 7.5). */
  async download(invoiceId: string): Promise<{ number: string; pdf: Buffer }> {
    const invoice = await this.invoices.detail(invoiceId);
    const file = await this.db.run(async (tx) => {
      const row = await tx.invoice.findFirstOrThrow({
        where: { id: invoiceId, garageId: this.db.garageId },
        select: { pdfFile: true },
      });
      return row.pdfFile;
    });
    const pdf = file ? await this.storage.get(file.storageKey) : null;
    if (!pdf) {
      await this.queueRender(invoiceId);
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.INVOICE_PDF_NOT_READY,
        'The PDF is being prepared. Try again in a moment',
      );
    }
    await this.audit.record({
      action: 'invoice.reprint',
      entityType: 'invoice',
      entityId: invoiceId,
    });
    return { number: invoice.number, pdf };
  }

  private async logoDataUrl(): Promise<string | null> {
    const garageId = this.db.garageId;
    const logo = await this.db.run(async (tx) => {
      const settings = await tx.garageSettings.findUniqueOrThrow({
        where: { garageId },
        include: { logo: true },
      });
      return settings.logo;
    });
    if (!logo) return null;
    const bytes = await this.storage.get(logo.storageKey);
    return bytes ? `data:${logo.mimeType};base64,${bytes.toString('base64')}` : null;
  }
}
