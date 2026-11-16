import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type BranchItem,
  ERROR_CODES,
  type Paginated,
  type PaginationQuery,
  type UpdateBranchInput,
} from '@gearva/contracts';
import { TenantDb } from '../common/db/tenant-db';
import { AppException } from '../common/errors/app-exception';
import { paginated, toSkipTake } from '../common/pagination';
import { toBranchItem, updateBranch } from './branch-rules';

/**
 * Branches of the signed-in garage (database.md 4.2). Every query runs in TenantDb (RLS)
 * and filters by the context's garageId too (README 5.1: code is the first line of
 * defense). Branch codes feed invoice numbers (flow.md 7.1), so they never change.
 * Since 2026-11-16 the garage only renames its branches and edits their address and
 * phone; adding one or switching one on or off is done by Gearva (admin, flow.md 11.7).
 */
@Injectable()
export class BranchesService {
  constructor(private readonly db: TenantDb) {}

  async list(query: PaginationQuery): Promise<Paginated<BranchItem>> {
    const garageId = this.db.garageId;
    const [items, total] = await this.db.run(
      async (tx) =>
        [
          await tx.branch.findMany({
            where: { garageId },
            orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
            ...toSkipTake(query),
          }),
          await tx.branch.count({ where: { garageId } }),
        ] as const,
    );
    return paginated(items.map(toBranchItem), total, query);
  }

  async update(branchId: string, input: UpdateBranchInput): Promise<BranchItem> {
    if (input.isActive !== undefined) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.BRANCHES_MANAGED_BY_GEARVA,
        'Only Gearva can switch a branch on or off',
      );
    }
    const garageId = this.db.garageId;
    const branch = await this.db.run((tx) => updateBranch(tx, garageId, branchId, input));
    return toBranchItem(branch);
  }
}
