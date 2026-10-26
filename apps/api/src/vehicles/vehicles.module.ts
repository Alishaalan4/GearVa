import { Module } from '@nestjs/common';
import { SuggestionsModule } from '../suggestions/suggestions.module';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';

@Module({
  imports: [SuggestionsModule],
  controllers: [VehiclesController],
  providers: [VehiclesService],
})
export class VehiclesModule {}
