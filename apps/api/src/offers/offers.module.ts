import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';

/** Offers (flow.md 10): garage side in step 6.5; targeting and broadcasts in Phase 7. */
@Module({
  imports: [FilesModule],
  controllers: [OffersController],
  providers: [OffersService],
})
export class OffersModule {}
