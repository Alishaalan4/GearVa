import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  type GlobalServiceTypeItem,
  type SystemSettings,
  type UpdateSystemSettingsInput,
  createGlobalServiceTypeSchema,
  updateGlobalServiceTypeSchema,
  updateSystemSettingsSchema,
} from '@gearva/contracts';
import { ZodValidationPipe, createZodDto } from 'nestjs-zod';
import { Audit } from '../../audit/audit.decorator';
import { RequestContext } from '../../common/context/request-context';
import { SystemSettingsService } from '../../system-settings/system-settings.service';
import { AdminGuard } from '../admin.guard';
import { requireSuperAdmin } from '../admin-roles';
import { AdminServiceTypesService } from './admin-service-types.service';

class CreateGlobalServiceTypeDto extends createZodDto(createGlobalServiceTypeSchema) {}
class UpdateGlobalServiceTypeDto extends createZodDto(updateGlobalServiceTypeSchema) {}

/**
 * flow.md 11.4: platform-wide settings. Every admin reads them; only super admins change
 * them, since they affect every garage. The settings schema has a cross-field refine, so
 * its body is validated with the schema directly instead of a DTO class.
 */
@Controller('admin/v1/settings')
@UseGuards(AdminGuard)
export class AdminSettingsController {
  constructor(
    private readonly settings: SystemSettingsService,
    private readonly context: RequestContext,
  ) {}

  @Get()
  get(): Promise<SystemSettings> {
    return this.settings.get();
  }

  @Patch()
  @Audit('system_settings.update', 'system_settings')
  update(
    @Body(new ZodValidationPipe(updateSystemSettingsSchema)) body: UpdateSystemSettingsInput,
  ): Promise<SystemSettings> {
    return this.settings.update(body, requireSuperAdmin(this.context));
  }
}

/** flow.md 11.4: the default service types every garage starts from. */
@Controller('admin/v1/service-types')
@UseGuards(AdminGuard)
export class AdminServiceTypesController {
  constructor(
    private readonly types: AdminServiceTypesService,
    private readonly context: RequestContext,
  ) {}

  @Get()
  list(): Promise<GlobalServiceTypeItem[]> {
    return this.types.list();
  }

  @Post()
  @Audit('service_type.create', 'service_type')
  create(@Body() body: CreateGlobalServiceTypeDto): Promise<GlobalServiceTypeItem> {
    requireSuperAdmin(this.context);
    return this.types.create(body);
  }

  @Patch(':serviceTypeId')
  @Audit('service_type.update', 'service_type')
  update(
    @Param('serviceTypeId', ParseUUIDPipe) serviceTypeId: string,
    @Body() body: UpdateGlobalServiceTypeDto,
  ): Promise<GlobalServiceTypeItem> {
    requireSuperAdmin(this.context);
    return this.types.update(serviceTypeId, body);
  }
}
