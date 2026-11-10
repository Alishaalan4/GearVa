import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type PublicPricing, applySchema } from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../audit/audit.decorator';
import { Public } from '../auth/staff-access.decorators';
import { ApplicationsService } from './applications.service';

class ApplyDto extends createZodDto(applySchema) {}

/** A visitor may send a few applications an hour from one address (flow.md 11.6). */
const APPLY_LIMIT = { default: { limit: 5, ttl: 60 * 60_000 } };

/** The public website's endpoints (flow.md 11.6). No session; nothing of any garage. */
@Controller('v1/public')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get('pricing')
  @Public()
  pricing(): Promise<PublicPricing> {
    return this.applications.pricing();
  }

  /** Always 202 with no body: the visitor only learns "we will contact you". */
  @Post('applications')
  @Public()
  @Throttle(APPLY_LIMIT)
  @HttpCode(HttpStatus.ACCEPTED)
  // A visitor is nobody to attribute an audit row to, so none is written (the
  // application row keeps the ip); the admin's approve and reject are audited.
  @Audit('application.create', 'garage_application')
  async apply(@Body() body: ApplyDto): Promise<void> {
    await this.applications.apply(body);
  }
}
