import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { type BranchItem, type Paginated, updateBranchSchema } from '@gearva/contracts';
import { createZodDto } from 'nestjs-zod';
import { Audit } from '../audit/audit.decorator';
import { Roles } from '../auth/staff-access.decorators';
import { PaginationQueryDto } from '../common/pagination';
import { BranchesService } from './branches.service';

class UpdateBranchDto extends createZodDto(updateBranchSchema) {}

/**
 * flow.md 1: the OWNER edits the branches' name, address and phone; the MANAGER can see
 * them. Adding a branch or switching one on or off is Gearva's (admin, flow.md 11.7).
 */
@Controller('v1/branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @Roles('OWNER', 'MANAGER')
  list(@Query() query: PaginationQueryDto): Promise<Paginated<BranchItem>> {
    return this.branches.list(query);
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
