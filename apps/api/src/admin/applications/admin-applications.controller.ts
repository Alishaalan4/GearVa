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
  type ApplicationDetail,
  type ApplicationListItem,
  type CreateGarageInput,
  type GarageDetail,
  type Paginated,
  applicationListQuerySchema,
  createGarageSchema,
  rejectApplicationSchema,
} from '@gearva/contracts';
import { ZodValidationPipe, createZodDto } from 'nestjs-zod';
import { Audit } from '../../audit/audit.decorator';
import { AdminGuard } from '../admin.guard';
import { AdminApplicationsService } from './admin-applications.service';

class ApplicationListQueryDto extends createZodDto(applicationListQuerySchema) {}
class RejectApplicationDto extends createZodDto(rejectApplicationSchema) {}

/** flow.md 11.6: the admin Applications page. Every admin may review. */
@Controller('admin/v1/applications')
@UseGuards(AdminGuard)
export class AdminApplicationsController {
  constructor(private readonly applications: AdminApplicationsService) {}

  @Get()
  list(@Query() query: ApplicationListQueryDto): Promise<Paginated<ApplicationListItem>> {
    return this.applications.list(query);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<ApplicationDetail> {
    return this.applications.detail(id);
  }

  /**
   * The body is the create-garage form (a union, so validated with the schema directly).
   * The answer is the new garage, so the audit row is the garage's, like garage.create.
   */
  @Post(':id/approve')
  @Audit('application.approve', 'garage')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createGarageSchema)) body: CreateGarageInput,
  ): Promise<GarageDetail> {
    return this.applications.approve(id, body);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Audit('application.reject', 'garage_application')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectApplicationDto,
  ): Promise<ApplicationDetail> {
    return this.applications.reject(id, body);
  }
}
