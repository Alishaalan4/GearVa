import { Global, Module } from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';

/** The admin's platform-wide settings, read by reminders, estimates and garage creation. */
@Global()
@Module({
  providers: [SystemSettingsService],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
