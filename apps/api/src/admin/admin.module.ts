import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from './admin.guard';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminGaragesController } from './garages/admin-garages.controller';
import { AdminGaragesService } from './garages/admin-garages.service';
import { AdminSubscriptionsService } from './garages/admin-subscriptions.service';
import { AdminServiceTypesService } from './settings/admin-service-types.service';
import {
  AdminServiceTypesController,
  AdminSettingsController,
} from './settings/admin-settings.controller';

/** Everything under /admin/v1 (README section 3). */
@Module({
  imports: [AuthModule],
  controllers: [
    AdminAuthController,
    AdminGaragesController,
    AdminSettingsController,
    AdminServiceTypesController,
  ],
  providers: [
    AdminAuthService,
    AdminGuard,
    AdminGaragesService,
    AdminSubscriptionsService,
    AdminServiceTypesService,
  ],
})
export class AdminModule {}
