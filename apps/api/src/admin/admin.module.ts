import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminGuard } from './admin.guard';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminGaragesController } from './garages/admin-garages.controller';
import { AdminGaragesService } from './garages/admin-garages.service';

/** Everything under /admin/v1 (README section 3). */
@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [AdminAuthController, AdminGaragesController],
  providers: [AdminAuthService, AdminGuard, AdminGaragesService],
})
export class AdminModule {}
