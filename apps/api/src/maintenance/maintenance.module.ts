import { Module } from '@nestjs/common';
import { SuggestionsModule } from '../suggestions/suggestions.module';
import { MaintenanceController } from './maintenance.controller';
import { RecordsService } from './records.service';
import { ServiceTypesService } from './service-types.service';

/** README 3: the domain "service" is called maintenance in code. */
@Module({
  imports: [SuggestionsModule],
  controllers: [MaintenanceController],
  providers: [ServiceTypesService, RecordsService],
  exports: [RecordsService],
})
export class MaintenanceModule {}
