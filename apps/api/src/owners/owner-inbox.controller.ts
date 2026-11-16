import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  type OwnerNotification,
  type Paginated,
  ownerNotificationsQuerySchema,
  registerDeviceSchema,
} from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../audit/audit.decorator';
import { OwnerInboxService } from './owner-inbox.service';

class OwnerNotificationsQueryDto extends createZodDto(ownerNotificationsQuerySchema) {}
class RegisterDeviceDto extends createZodDto(registerDeviceSchema) {}

/** mobile-api.md 6.1, 6.2: the inbox. Signed in (OwnerGuard). */
@Controller('mobile/v1/notifications')
export class OwnerNotificationsController {
  constructor(private readonly inbox: OwnerInboxService) {}

  @Get()
  list(@Query() query: OwnerNotificationsQueryDto): Promise<Paginated<OwnerNotification>> {
    return this.inbox.list(query);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit('owner.notifications.read_all', 'notification')
  markAllRead(): Promise<void> {
    return this.inbox.markAllRead();
  }

  @Post(':notificationId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit('owner.notification.read', 'notification')
  markRead(@Param('notificationId', ParseUUIDPipe) notificationId: string): Promise<void> {
    return this.inbox.markRead(notificationId);
  }
}

/** mobile-api.md 6.4: the phone's push token. Signed in (OwnerGuard). */
@Controller('mobile/v1/devices')
export class OwnerDevicesController {
  constructor(private readonly inbox: OwnerInboxService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit('owner.device.register', 'device_token')
  register(@Body() body: RegisterDeviceDto): Promise<void> {
    return this.inbox.registerDevice(body);
  }

  @Delete(':token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit('owner.device.remove', 'device_token')
  remove(@Param('token') token: string): Promise<void> {
    return this.inbox.removeDevice(token);
  }
}
