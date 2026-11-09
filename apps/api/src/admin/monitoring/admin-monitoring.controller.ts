import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  type BusinessView,
  type ExpiringGarages,
  type FailedMessage,
  type MonitoredGarage,
  type Paginated,
  expiringQuerySchema,
  failuresQuerySchema,
  usageQuerySchema,
} from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { AdminGuard } from '../admin.guard';
import { AdminMonitoringService } from './admin-monitoring.service';

class ExpiringQueryDto extends createZodDto(expiringQuerySchema) {}
class UsageQueryDto extends createZodDto(usageQuerySchema) {}
class FailuresQueryDto extends createZodDto(failuresQuerySchema) {}

/** flow.md 11.2 and 11.5: lists, counts and revenue for every admin. Read only. */
@Controller('admin/v1')
@UseGuards(AdminGuard)
export class AdminMonitoringController {
  constructor(private readonly monitoring: AdminMonitoringService) {}

  @Get('monitoring/expiring')
  expiring(@Query() query: ExpiringQueryDto): Promise<ExpiringGarages> {
    return this.monitoring.expiring(query);
  }

  @Get('monitoring/usage')
  usage(@Query() query: UsageQueryDto): Promise<Paginated<MonitoredGarage>> {
    return this.monitoring.usage(query);
  }

  @Get('monitoring/failures')
  failures(@Query() query: FailuresQueryDto): Promise<Paginated<FailedMessage>> {
    return this.monitoring.failures(query);
  }

  @Get('business')
  business(): Promise<BusinessView> {
    return this.monitoring.business();
  }
}
