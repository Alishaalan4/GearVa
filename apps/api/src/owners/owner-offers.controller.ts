import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { OwnerOffer } from '@gearva/contracts';
import type { Response } from 'express';
import { Audit } from '../audit/audit.decorator';
import { OwnerOffersService } from './owner-offers.service';

/** mobile-api.md 7: the active offers of the owner's garages. Signed in (OwnerGuard). */
@Controller('mobile/v1/offers')
export class OwnerOffersController {
  constructor(private readonly offers: OwnerOffersService) {}

  @Get()
  list(): Promise<OwnerOffer[]> {
    return this.offers.list();
  }

  /** Cacheable for a day; the image of an offer does not change often. */
  @Get(':offerId/image')
  async image(
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { bytes, mimeType } = await this.offers.image(offerId);
    res
      .set({
        'Content-Type': mimeType,
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(bytes);
  }

  @Post(':offerId/viewed')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit('owner.offer.viewed', 'offer')
  viewed(@Param('offerId', ParseUUIDPipe) offerId: string): Promise<void> {
    return this.offers.viewed(offerId);
  }
}
