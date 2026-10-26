import { Module } from '@nestjs/common';
import { MaintenanceModule } from '../maintenance/maintenance.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

@Module({
  imports: [MaintenanceModule, NotificationsModule],
  controllers: [VisitsController],
  providers: [VisitsService],
})
export class VisitsModule {}
