import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type BranchItem,
  type CreateBranchInput,
  ERROR_CODES,
  type Paginated,
  type PaginationQuery,
  type UpdateBranchInput,
} from '@gearva/contracts';
import { type Branch, Prisma } from '@gearva/database';
import { TenantDb } from '../common/db/tenant-db';
import { AppException } from '../common/errors/app-exception';
import { paginated, toSkipTake } from '../common/pagination';

function toItem(b: Branch): BranchItem {
  return {
    id: b.id,
    name: b.name,
    code: b.code,
    address: b.address,
    phone: b.phone,
    isMain: b.isMain,
    isActive: b.isActive,
  };
}

/** The next free code: BR1, BR2, ... (codes are never reused or renamed). */
function nextCode(existing: string[]): string {
  const numbers = existing.map((c) => Number(/^BR(\d+)$/.exec(c)?.[1] ?? 0));
  return `BR${Math.max(0, ...numbers) + 1}`;
}

/**
 * Branches of the signed-in garage (database.md 4.2). Every query runs in TenantDb (RLS)
 * and filters by the context's garageId too (README 5.1: code is the first line of
 * defense). Branch codes feed invoice numbers (flow.md 7.1), so they never change.
 */
@Injectable()
export class BranchesService {
  constructor(private readonly db: TenantDb) {}

  async list(query: PaginationQuery): Promise<Paginated<BranchItem>> {
    const garageId = this.db.garageId;
    const [items, total] = await this.db.run((tx) =>
      Promise.all([
        tx.branch.findMany({
          where: { garageId },
          orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
          ...toSkipTake(query),
        }),
        tx.branch.count({ where: { garageId } }),
      ]),
    );
    return paginated(items.map(toItem), total, query);
  }

  async create(input: CreateBranchInput): Promise<BranchItem> {
    const garageId = this.db.garageId;
    // Two owners adding a branch at the same moment may pick the same code; retry then.
    for (let attempt = 0; ; attempt++) {
      try {
        const branch = await this.db.run(async (tx) => {
          const codes = await tx.branch.findMany({ where: { garageId }, select: { code: true } });
          return tx.branch.create({
            data: {
              garageId,
              name: input.name,
              address: input.address ?? null,
              phone: input.phone ?? null,
              code: nextCode(codes.map((c) => c.code)),
            },
          });
        });
        return toItem(branch);
      } catch (error) {
        const duplicate =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!duplicate || attempt >= 2) throw error;
      }
    }
  }

  async update(branchId: string, input: UpdateBranchInput): Promise<BranchItem> {
    const garageId = this.db.garageId;
    const branch = await this.db.run(async (tx) => {
      const current = await tx.branch.findFirst({ where: { id: branchId, garageId } });
      if (!current) throw notFound();
      if (input.isActive === false && current.isMain) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.MAIN_BRANCH_REQUIRED,
          'The main branch cannot be deactivated',
        );
      }
      // Work is recorded per branch (visits, invoices), so nobody active may stay in a
      // branch that is switched off: the owner moves or deactivates them first.
      if (input.isActive === false && current.isActive) {
        const activeStaff = await tx.user.count({
          where: { garageId, branchId: current.id, isActive: true },
        });
        if (activeStaff > 0) {
          throw new AppException(
            HttpStatus.CONFLICT,
            ERROR_CODES.BRANCH_HAS_STAFF,
            'Move or deactivate the active staff of this branch first',
            { activeStaff },
          );
        }
      }
      return tx.branch.update({
        where: { id: current.id },
        data: {
          name: input.name,
          address: input.address,
          phone: input.phone,
          isActive: input.isActive,
        },
      });
    });
    return toItem(branch);
  }
}

function notFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Branch not found');
}
