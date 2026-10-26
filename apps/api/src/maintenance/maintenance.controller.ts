import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  type HistoryItem,
  type Paginated,
  type PrefillResponse,
  type ServiceTypeItem,
  prefillQuerySchema,
} from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { PaginationQueryDto } from '../common/pagination';
import { RecordsService } from './records.service';
import { ServiceTypesService } from './service-types.service';

class PrefillQueryDto extends createZodDto(prefillQuerySchema) {}

/** Reading service data: any signed-in staff member (flow.md 1). */
@Controller('v1')
export class MaintenanceController {
  constructor(
    private readonly types: ServiceTypesService,
    private readonly records: RecordsService,
  ) {}

  @Get('service-types')
  serviceTypes(): Promise<ServiceTypeItem[]> {
    return this.types.list();
  }

  /** flow.md 4.1 step 3: the pre-filled quick entry form for one service. */
  @Get('vehicles/:vehicleId/prefill')
  prefill(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query() query: PrefillQueryDto,
  ): Promise<PrefillResponse> {
    return this.records.prefill(vehicleId, query.serviceTypeId);
  }

  @Get('vehicles/:vehicleId/history')
  history(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<HistoryItem>> {
    return this.records.history(vehicleId, query);
  }
}
