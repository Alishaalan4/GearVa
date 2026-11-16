import { Controller, Get, Headers, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import {
  type OwnerInvoiceDetail,
  type OwnerInvoiceItem,
  type OwnerVehicle,
  type OwnerVehicleDetail,
  type OwnerVisit,
  type Paginated,
  ownerInvoicesQuerySchema,
  ownerVisitsQuerySchema,
} from '@gearva/contracts';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { OwnerReadService } from './owner-read.service';

class OwnerVisitsQueryDto extends createZodDto(ownerVisitsQuerySchema) {}
class OwnerInvoicesQueryDto extends createZodDto(ownerInvoicesQuerySchema) {}

/** mobile-api.md 4: the owner's cars and their history. Signed in (OwnerGuard). */
@Controller('mobile/v1/vehicles')
export class OwnerVehiclesController {
  constructor(private readonly read: OwnerReadService) {}

  @Get()
  async list(@Headers('accept-language') lang?: string): Promise<OwnerVehicle[]> {
    return this.read.vehicles(await this.read.locale(lang));
  }

  @Get(':vehicleId')
  async detail(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Headers('accept-language') lang?: string,
  ): Promise<OwnerVehicleDetail> {
    return this.read.vehicle(vehicleId, await this.read.locale(lang));
  }

  @Get(':vehicleId/visits')
  async visits(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query() query: OwnerVisitsQueryDto,
    @Headers('accept-language') lang?: string,
  ): Promise<Paginated<OwnerVisit>> {
    return this.read.visits(vehicleId, query, await this.read.locale(lang));
  }
}

/** mobile-api.md 5: the owner's invoices and their PDFs. Signed in (OwnerGuard). */
@Controller('mobile/v1/invoices')
export class OwnerInvoicesController {
  constructor(private readonly read: OwnerReadService) {}

  @Get()
  list(@Query() query: OwnerInvoicesQueryDto): Promise<Paginated<OwnerInvoiceItem>> {
    return this.read.invoices(query);
  }

  @Get(':invoiceId')
  detail(@Param('invoiceId', ParseUUIDPipe) invoiceId: string): Promise<OwnerInvoiceDetail> {
    return this.read.invoice(invoiceId);
  }

  @Get(':invoiceId/pdf')
  async pdf(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { number, pdf } = await this.read.invoicePdf(invoiceId);
    res
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${number.replace(/[^\w.-]/g, '-')}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(pdf);
  }
}
