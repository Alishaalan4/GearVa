import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { type AdminBranchItem, createBranchSchema, updateBranchSchema } from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../../audit/audit.decorator';
import { AdminGuard } from '../admin.guard';
import { AdminBranchesService } from './admin-branches.service';

class CreateBranchDto extends createZodDto(createBranchSchema) {}
class UpdateBranchDto extends createZodDto(updateBranchSchema) {}

/**
 * flow.md 11.7: a garage's branches, managed by Gearva: any admin sees them, super admins
 * change them (step 5.10). The audit row carries
 * the garage (the :garageId param).
 */
@Controller('admin/v1/garages/:garageId/branches')
@UseGuards(AdminGuard)
export class AdminBranchesController {
  constructor(private readonly branches: AdminBranchesService) {}

  @Get()
  list(@Param('garageId', ParseUUIDPipe) garageId: string): Promise<AdminBranchItem[]> {
    return this.branches.list(garageId);
  }

  @Post()
  @Audit('admin.branch.create', 'branch')
  create(
    @Param('garageId', ParseUUIDPipe) garageId: string,
    @Body() body: CreateBranchDto,
  ): Promise<AdminBranchItem> {
    return this.branches.create(garageId, body);
  }

  @Patch(':branchId')
  @Audit('admin.branch.update', 'branch')
  update(
    @Param('garageId', ParseUUIDPipe) garageId: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() body: UpdateBranchDto,
  ): Promise<AdminBranchItem> {
    return this.branches.update(garageId, branchId, body);
  }
}
