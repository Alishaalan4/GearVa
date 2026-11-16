import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OwnerAccountService } from './owner-account.service';
import { OwnerGaragesController, OwnerMeController } from './owner-account.controller';
import { OwnerAuthController } from './owner-auth.controller';
import { OwnerAuthService } from './owner-auth.service';
import { OwnerGuard } from './owner.guard';

/** Car-owner accounts and the owner app API, /mobile/v1 (Phase 6, docs/mobile-api.md). */
@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [OwnerAuthController, OwnerMeController, OwnerGaragesController],
  providers: [OwnerAuthService, OwnerAccountService, OwnerGuard],
  exports: [OwnerGuard],
})
export class OwnersModule {}
