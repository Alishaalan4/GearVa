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
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type DueReminderItem,
  type MarkWhatsappSentResponse,
  type Paginated,
  type ReminderSettings,
  markWhatsappSentSchema,
  updateReminderSettingsSchema,
} from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../audit/audit.decorator';
import { Roles } from '../auth/staff-access.decorators';
import { PaginationQueryDto } from '../common/pagination';
import { ReminderListService } from './reminder-list.service';
import { ReminderSettingsService } from './reminder-settings.service';

class MarkWhatsappSentDto extends createZodDto(markWhatsappSentSchema) {}
class UpdateReminderSettingsDto extends createZodDto(updateReminderSettingsSchema) {}

/** flow.md 9.5: the WhatsApp list, for the owner, managers and receptionists (flow.md 1). */
@Controller('v1/reminders')
export class RemindersController {
  constructor(private readonly list: ReminderListService) {}

  @Get('due')
  @Roles('OWNER', 'MANAGER', 'RECEPTIONIST')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  due(@Query() query: PaginationQueryDto): Promise<Paginated<DueReminderItem>> {
    return this.list.due(query);
  }

  @Post(':reminderId/whatsapp-sent')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER', 'MANAGER', 'RECEPTIONIST')
  @Audit('reminder.whatsapp_sent', 'reminder')
  markWhatsappSent(
    @Param('reminderId', ParseUUIDPipe) reminderId: string,
    @Body() body: MarkWhatsappSentDto,
  ): Promise<MarkWhatsappSentResponse> {
    return this.list.markWhatsappSent(reminderId, body.round);
  }
}

/** The garage's reminder settings (database.md 4.2): owner only, like all garage settings. */
@Controller('v1/reminder-settings')
export class ReminderSettingsController {
  constructor(private readonly settings: ReminderSettingsService) {}

  @Get()
  @Roles('OWNER')
  get(): Promise<ReminderSettings> {
    return this.settings.get();
  }

  @Patch()
  @Roles('OWNER')
  @Audit('reminder_settings.update', 'garage_settings')
  update(@Body() body: UpdateReminderSettingsDto): Promise<ReminderSettings> {
    return this.settings.update(body);
  }
}
