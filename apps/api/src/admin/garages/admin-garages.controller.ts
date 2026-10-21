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
  createGarageSchema,
  garageListQuerySchema,
  suspendGarageSchema,
} from '@gearva/contracts';
import { ZodValidationPipe, createZodDto } from 'nestjs-zod';
import { Audit } from '../../audit/audit.decorator';
import { AdminGuard } from '../admin.guard';
import { AdminGaragesService } from './admin-garages.service';

// createGarageSchema is a union (trial | paid), which a class cannot extend, so that body
// is validated with the schema directly instead of a DTO class.
class GarageListQueryDto extends createZodDto(garageListQuerySchema) {}
class SuspendGarageDto extends createZodDto(suspendGarageSchema) {}

/** flow.md 2.1 and 11.1; README section 3: all V2 endpoints live under /admin/v1. */
@Controller('admin/v1/garages')
@UseGuards(AdminGuard)
export class AdminGaragesController {
  constructor(private readonly garages: AdminGaragesService) {}

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

  @Post(':garageId/reactivate')
  @HttpCode(HttpStatus.OK)
  @Audit('garage.reactivate', 'garage')
  reactivate(@Param('garageId', ParseUUIDPipe) garageId: string): Promise<GarageDetail> {
    return this.garages.reactivate(garageId);
  }
}
