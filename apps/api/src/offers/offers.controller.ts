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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  OFFER_IMAGE_MAX_BYTES,
  type OfferItem,
  type Paginated,
  createOfferSchema,
  offerListQuerySchema,
  updateOfferSchema,
} from '@gearva/contracts';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../audit/audit.decorator';
import { Roles } from '../auth/staff-access.decorators';
import { OffersService } from './offers.service';

class CreateOfferDto extends createZodDto(createOfferSchema) {}
class UpdateOfferDto extends createZodDto(updateOfferSchema) {}
class OfferListQueryDto extends createZodDto(offerListQuerySchema) {}

/** flow.md 1: "Offers and broadcasts" are for OWNER and MANAGER. */
@Controller('v1/offers')
@Roles('OWNER', 'MANAGER')
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Get()
  list(@Query() query: OfferListQueryDto): Promise<Paginated<OfferItem>> {
    return this.offers.list(query);
  }

  @Post()
  @Audit('offer.create', 'offer')
  create(@Body() body: CreateOfferDto): Promise<OfferItem> {
    return this.offers.create(body);
  }

  @Get(':offerId')
  detail(@Param('offerId', ParseUUIDPipe) offerId: string): Promise<OfferItem> {
    return this.offers.detail(offerId);
  }

  @Patch(':offerId')
  @Audit('offer.update', 'offer')
  update(
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Body() body: UpdateOfferDto,
  ): Promise<OfferItem> {
    return this.offers.update(offerId, body);
  }

  @Get(':offerId/image')
  async image(
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { bytes, mimeType } = await this.offers.image(offerId);
    res.set({ 'Content-Type': mimeType, 'X-Content-Type-Options': 'nosniff' }).send(bytes);
  }

  @Post(':offerId/image')
  @HttpCode(HttpStatus.OK)
  @Audit('offer.image', 'offer')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: OFFER_IMAGE_MAX_BYTES } }))
  saveImage(
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<OfferItem> {
    return this.offers.saveImage(offerId, file?.buffer ?? Buffer.alloc(0));
  }
}
