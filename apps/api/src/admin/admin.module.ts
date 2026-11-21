import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OwnersModule } from '../owners/owners.module';
import { AdminGuard } from './admin.guard';
import { AdminAnnouncementsController } from './announcements/admin-announcements.controller';
import { AdminAnnouncementsService } from './announcements/admin-announcements.service';
import { AdminApplicationsController } from './applications/admin-applications.controller';
import { AdminApplicationsService } from './applications/admin-applications.service';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminAuditController } from './audit/admin-audit.controller';
import { AdminAuditService } from './audit/admin-audit.service';
import { AdminBranchesController } from './garages/admin-branches.controller';
import { AdminBranchesService } from './garages/admin-branches.service';
import { AdminGaragesController } from './garages/admin-garages.controller';
import { AdminReminderSettingsController } from './garages/admin-reminder-settings.controller';
import { AdminReminderSettingsService } from './garages/admin-reminder-settings.service';
import { AdminGaragesService } from './garages/admin-garages.service';
import { AdminSubscriptionsService } from './garages/admin-subscriptions.service';
import { AdminMonitoringController } from './monitoring/admin-monitoring.controller';
import { AdminMonitoringService } from './monitoring/admin-monitoring.service';
import { AdminServiceTypesService } from './settings/admin-service-types.service';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminUsersService } from './users/admin-users.service';
import {
  AdminServiceTypesController,
  AdminSettingsController,
} from './settings/admin-settings.controller';

/** Everything under /admin/v1 (README section 3). */
@Module({
  imports: [AuthModule, OwnersModule, NotificationsModule],
  controllers: [
    AdminAuthController,
    AdminGaragesController,
    AdminBranchesController,
    AdminReminderSettingsController,
    AdminSettingsController,
    AdminServiceTypesController,
    AdminMonitoringController,
    AdminApplicationsController,
    AdminUsersController,
    AdminAuditController,
    AdminAnnouncementsController,
  ],
  providers: [
    AdminAuthService,
    AdminGuard,
    AdminGaragesService,
    AdminBranchesService,
    AdminReminderSettingsService,
    AdminSubscriptionsService,
    AdminServiceTypesService,
    AdminMonitoringService,
    AdminApplicationsService,
    AdminUsersService,
    AdminAuditService,
    AdminAnnouncementsService,
  ],
})
export class AdminModule {}
