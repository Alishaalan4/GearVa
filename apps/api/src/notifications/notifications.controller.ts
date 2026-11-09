import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type NotificationLogItem,
  type Paginated,
  notificationLogQuerySchema,
} from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../auth/staff-access.decorators';
import { NotificationLogService } from './notification-log.service';

class NotificationLogQueryDto extends createZodDto(notificationLogQuerySchema) {}

/** flow.md 1 and 9.4: the notification log, for the owner and managers. */
@Controller('v1/notifications')
export class NotificationsController {
  constructor(private readonly log: NotificationLogService) {}

  @Get()
  @Roles('OWNER', 'MANAGER')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  list(@Query() query: NotificationLogQueryDto): Promise<Paginated<NotificationLogItem>> {
    return this.log.list(query);
  }
}
