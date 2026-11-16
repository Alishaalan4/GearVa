import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OwnerAuthController } from './owner-auth.controller';
import { OwnerAuthService } from './owner-auth.service';

/** Car-owner accounts and the owner app API, /mobile/v1 (Phase 6, docs/mobile-api.md). */
@Module({
  imports: [AuthModule],
  controllers: [OwnerAuthController],
  providers: [OwnerAuthService],
})
export class OwnersModule {}
