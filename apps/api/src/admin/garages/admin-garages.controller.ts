import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type CreateGarageInput,
  type GarageDetail,
  type GarageListItem,
  type Paginated,
  type RecordSubscriptionPaymentInput,
  createGarageSchema,
  extendTrialSchema,
  garageListQuerySchema,
  recordSubscriptionPaymentSchema,
  suspendGarageSchema,
} from '@gearva/contracts';
import { ZodValidationPipe, createZodDto } from 'nestjs-zod';
import { Audit } from '../../audit/audit.decorator';
import { AdminGuard } from '../admin.guard';
import { AdminGaragesService } from './admin-garages.service';
import { AdminSubscriptionsService } from './admin-subscriptions.service';

// createGarageSchema is a union (trial | paid) and the payment schema has a cross-field
// refine, which a class cannot extend, so those bodies are validated with the schema
// directly instead of a DTO class.
class GarageListQueryDto extends createZodDto(garageListQuerySchema) {}
class SuspendGarageDto extends createZodDto(suspendGarageSchema) {}
class ExtendTrialDto extends createZodDto(extendTrialSchema) {}

/** flow.md 2.1 and 11.1; README section 3: all V2 endpoints live under /admin/v1. */
@Controller('admin/v1/garages')
@UseGuards(AdminGuard)
export class AdminGaragesController {
  constructor(
    private readonly garages: AdminGaragesService,
    private readonly subscriptions: AdminSubscriptionsService,
  ) {}

  @Post()
  @Audit('garage.create', 'garage')
  create(
    @Body(new ZodValidationPipe(createGarageSchema)) body: CreateGarageInput,
  ): Promise<GarageDetail> {
    return this.garages.create(body);
  }

  @Get()
  list(@Query() query: GarageListQueryDto): Promise<Paginated<GarageListItem>> {
    return this.garages.list(query);
  }

  @Get(':garageId')
  detail(@Param('garageId', ParseUUIDPipe) garageId: string): Promise<GarageDetail> {
    return this.garages.detail(garageId);
  }

  @Post(':garageId/invite')
  @HttpCode(HttpStatus.OK)
  @Audit('garage.owner.invite', 'garage')
  resendInvite(@Param('garageId', ParseUUIDPipe) garageId: string): Promise<GarageDetail> {
    return this.garages.resendInvite(garageId);
  }

  @Post(':garageId/password-reset')
  @HttpCode(HttpStatus.OK)
  @Audit('garage.owner.password_reset', 'garage')
  passwordReset(@Param('garageId', ParseUUIDPipe) garageId: string): Promise<GarageDetail> {
    return this.garages.sendPasswordReset(garageId);
  }

  @Post(':garageId/suspend')
  @HttpCode(HttpStatus.OK)
  @Audit('garage.suspend', 'garage')
  suspend(
    @Param('garageId', ParseUUIDPipe) garageId: string,
    @Body() body: SuspendGarageDto,
  ): Promise<GarageDetail> {
    return this.garages.suspend(garageId, body);
  }

  /** flow.md 11.1: record a subscription payment; the garage is paid until the new date. */
  @Post(':garageId/payments')
  @Audit('garage.payment', 'garage')
  async recordPayment(
    @Param('garageId', ParseUUIDPipe) garageId: string,
    @Body(new ZodValidationPipe(recordSubscriptionPaymentSchema))
    body: RecordSubscriptionPaymentInput,
  ): Promise<GarageDetail> {
    await this.subscriptions.recordPayment(garageId, body);
    return this.garages.detail(garageId);
  }

  @Post(':garageId/extend-trial')
  @HttpCode(HttpStatus.OK)
  @Audit('garage.trial.extend', 'garage')
  async extendTrial(
    @Param('garageId', ParseUUIDPipe) garageId: string,
    @Body() body: ExtendTrialDto,
  ): Promise<GarageDetail> {
    await this.subscriptions.extendTrial(garageId, body);
    return this.garages.detail(garageId);
  }

  @Post(':garageId/reactivate')
  @HttpCode(HttpStatus.OK)
  @Audit('garage.reactivate', 'garage')
  reactivate(@Param('garageId', ParseUUIDPipe) garageId: string): Promise<GarageDetail> {
    return this.garages.reactivate(garageId);
  }
}
