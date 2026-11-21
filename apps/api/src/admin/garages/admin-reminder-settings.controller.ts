import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { type ReminderSettings, updateReminderSettingsSchema } from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../../audit/audit.decorator';
import { AdminGuard } from '../admin.guard';
import { AdminReminderSettingsService } from './admin-reminder-settings.service';

class UpdateReminderSettingsDto extends createZodDto(updateReminderSettingsSchema) {}

/**
 * Step 7.4: a garage's reminder settings, set by Gearva. Any admin reads them; super admins
 * change them. The audit row carries the garage (the :garageId param).
 */
@Controller('admin/v1/garages/:garageId/reminder-settings')
@UseGuards(AdminGuard)
export class AdminReminderSettingsController {
  constructor(private readonly settings: AdminReminderSettingsService) {}

  @Get()
  get(@Param('garageId', ParseUUIDPipe) garageId: string): Promise<ReminderSettings> {
    return this.settings.get(garageId);
  }

  @Patch()
  @Audit('admin.reminder_settings.update', 'garage_settings')
  update(
    @Param('garageId', ParseUUIDPipe) garageId: string,
    @Body() body: UpdateReminderSettingsDto,
  ): Promise<ReminderSettings> {
    return this.settings.update(garageId, body);
  }
}
