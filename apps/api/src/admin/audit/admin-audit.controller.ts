import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  type AccessLogItem,
  type AuditLogItem,
  type Paginated,
  accessLogQuerySchema,
  auditLogQuerySchema,
} from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { AdminGuard } from '../admin.guard';
import { AdminAuditService } from './admin-audit.service';

class AuditLogQueryDto extends createZodDto(auditLogQuerySchema) {}
class AccessLogQueryDto extends createZodDto(accessLogQuerySchema) {}

/** flow.md 11.10 (step 5.10): the audit log and the access log. Super admins only. */
@Controller('admin/v1/audit')
@UseGuards(AdminGuard)
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditService) {}

  @Get()
  list(@Query() query: AuditLogQueryDto): Promise<Paginated<AuditLogItem>> {
    return this.audit.list(query);
  }

  @Get('access')
  accessLog(@Query() query: AccessLogQueryDto): Promise<Paginated<AccessLogItem>> {
    return this.audit.accessLog(query);
  }
}
