import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  type BranchItem,
  type Paginated,
  createBranchSchema,
  updateBranchSchema,
} from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../audit/audit.decorator';
import { Roles } from '../auth/staff-access.decorators';
import { PaginationQueryDto } from '../common/pagination';
import { BranchesService } from './branches.service';

class CreateBranchDto extends createZodDto(createBranchSchema) {}
class UpdateBranchDto extends createZodDto(updateBranchSchema) {}

/** flow.md 1: branches are managed by the OWNER; the MANAGER can see them. */
@Controller('v1/branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @Roles('OWNER', 'MANAGER')
  list(@Query() query: PaginationQueryDto): Promise<Paginated<BranchItem>> {
    return this.branches.list(query);
  }

  @Post()
  @Roles('OWNER')
  @Audit('branch.create', 'branch')
  create(@Body() body: CreateBranchDto): Promise<BranchItem> {
    return this.branches.create(body);
  }

  @Patch(':branchId')
  @Roles('OWNER')
  @Audit('branch.update', 'branch')
  update(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() body: UpdateBranchDto,
  ): Promise<BranchItem> {
    return this.branches.update(branchId, body);
  }
}
