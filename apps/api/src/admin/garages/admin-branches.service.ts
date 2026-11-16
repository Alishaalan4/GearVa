import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type AdminBranchItem,
  type CreateBranchInput,
  ERROR_CODES,
  type UpdateBranchInput,
} from '@gearva/contracts';
import type { Branch, Prisma } from '@gearva/database';
import { createBranch, toBranchItem, updateBranch } from '../../branches/branch-rules';
import { PlatformDb } from '../../common/db/platform-db';
import { AppException } from '../../common/errors/app-exception';

/**
 * flow.md 11.7 (decision 2026-11-16): Gearva adds a garage's branches and switches them
 * on or off, because extra branches are billed (flow.md 11.1). The same rules as the
 * garage's own API (branch-rules.ts), through the platform role with the garage in
 * every query. Branch details are not customer data, so no access-log row is written.
 */
@Injectable()
export class AdminBranchesService {
  constructor(private readonly platformDb: PlatformDb) {}

  async list(garageId: string): Promise<AdminBranchItem[]> {
    const db = this.platformDb.client;
    await this.requireGarage(garageId);
    const branches = await db.branch.findMany({
      where: { garageId },
      include: { _count: { select: { users: { where: { isActive: true } } } } },
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
    });
    return branches.map((b) => ({ ...toBranchItem(b), activeStaff: b._count.users }));
  }

  async create(garageId: string, input: CreateBranchInput): Promise<AdminBranchItem> {
    await this.requireGarage(garageId);
    const branch = await createBranch(
      (fn) => this.platformDb.client.$transaction(fn),
      garageId,
      input,
    );
    return this.item(branch);
  }

  async update(
    garageId: string,
    branchId: string,
    input: UpdateBranchInput,
  ): Promise<AdminBranchItem> {
    await this.requireGarage(garageId);
    const branch = await this.platformDb.client.$transaction((tx: Prisma.TransactionClient) =>
      updateBranch(tx, garageId, branchId, input),
    );
    return this.item(branch);
  }

  private async item(branch: Branch): Promise<AdminBranchItem> {
    const activeStaff = await this.platformDb.client.user.count({
      where: { garageId: branch.garageId, branchId: branch.id, isActive: true },
    });
    return { ...toBranchItem(branch), activeStaff };
  }

  private async requireGarage(garageId: string): Promise<void> {
    const garage = await this.platformDb.client.garage.findFirst({
      where: { id: garageId, deletedAt: null },
      select: { id: true },
    });
    if (!garage) {
      throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Garage not found');
    }
  }
}
