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
  ],
  providers: [OwnerAuthService, OwnerAccountService, OwnerReadService, OwnerGuard],
  exports: [OwnerGuard],
})
export class OwnersModule {}
