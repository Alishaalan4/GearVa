import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OwnerAccountService } from './owner-account.service';
import { OwnerGaragesController, OwnerMeController } from './owner-account.controller';
import { OwnerAuthController } from './owner-auth.controller';
import { OwnerAuthService } from './owner-auth.service';
import { OwnerInvoicesController, OwnerVehiclesController } from './owner-read.controller';
import { OwnerReadService } from './owner-read.service';
import { OwnerDevicesController, OwnerNotificationsController } from './owner-inbox.controller';
import { OwnerInboxService } from './owner-inbox.service';
import { OwnerOffersController } from './owner-offers.controller';
import { OwnerOffersService } from './owner-offers.service';
import { OwnerGuard } from './owner.guard';

/** Car-owner accounts and the owner app API, /mobile/v1 (Phase 6, docs/mobile-api.md). */
@Module({
  imports: [AuthModule, NotificationsModule, FilesModule, InvoicesModule],
  controllers: [
    OwnerAuthController,
    OwnerMeController,
    OwnerGaragesController,
    OwnerVehiclesController,
    OwnerInvoicesController,
    OwnerNotificationsController,
    OwnerDevicesController,
    OwnerOffersController,
  ],
  providers: [
    OwnerAuthService,
    OwnerAccountService,
    OwnerReadService,
    OwnerInboxService,
    OwnerOffersService,
    OwnerGuard,
  ],
  exports: [OwnerGuard, OwnerAuthService],
})
export class OwnersModule {}
