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
} from '@nestjs/common';
import {
  type VisitDetail,
  addRecordsSchema,
  openVisitSchema,
  quickVisitSchema,
  updateVisitSchema,
} from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../audit/audit.decorator';
import { Roles } from '../auth/staff-access.decorators';
import { VisitsService } from './visits.service';

class QuickVisitDto extends createZodDto(quickVisitSchema) {}
class OpenVisitDto extends createZodDto(openVisitSchema) {}
class AddRecordsDto extends createZodDto(addRecordsSchema) {}
class UpdateVisitDto extends createZodDto(updateVisitSchema) {}

/**
 * flow.md 1: quick entry, visits and service records are for OWNER, MANAGER and
 * MECHANIC; a RECEPTIONIST can read a visit but not create or change one.
 */
@Controller('v1/visits')
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  /** flow.md 4.2: visit + records + reminders in one transaction. */
  @Post('quick')
  @Roles('OWNER', 'MANAGER', 'MECHANIC')
  @Audit('visit.quick', 'visit')
  quick(@Body() body: QuickVisitDto): Promise<VisitDetail> {
    return this.visits.quick(body);
  }

  @Post()
  @Roles('OWNER', 'MANAGER', 'MECHANIC')
  @Audit('visit.open', 'visit')
  open(@Body() body: OpenVisitDto): Promise<VisitDetail> {
    return this.visits.openVisit(body);
  }

  @Get(':visitId')
  detail(@Param('visitId', ParseUUIDPipe) visitId: string): Promise<VisitDetail> {
    return this.visits.detail(visitId);
  }

  @Post(':visitId/records')
  @Roles('OWNER', 'MANAGER', 'MECHANIC')
  @Audit('visit.add_records', 'visit')
  addRecords(
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() body: AddRecordsDto,
  ): Promise<VisitDetail> {
    return this.visits.addRecords(visitId, body);
  }

  @Patch(':visitId')
  @Roles('OWNER', 'MANAGER', 'MECHANIC')
  @Audit('visit.update', 'visit')
  update(
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body() body: UpdateVisitDto,
  ): Promise<VisitDetail> {
    return this.visits.update(visitId, body);
  }

  @Post(':visitId/finish')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER', 'MANAGER', 'MECHANIC')
  @Audit('visit.finish', 'visit')
  finish(@Param('visitId', ParseUUIDPipe) visitId: string): Promise<VisitDetail> {
    return this.visits.finish(visitId);
  }
}
