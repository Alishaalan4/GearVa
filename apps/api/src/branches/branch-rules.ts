import { HttpStatus } from '@nestjs/common';
import {
  type BranchItem,
  type CreateBranchInput,
  ERROR_CODES,
  type UpdateBranchInput,
} from '@gearva/contracts';
import { type Branch, Prisma } from '@gearva/database';
import { AppException } from '../common/errors/app-exception';

// The branch rules (database.md 4.2), shared by the garage's own API (renaming) and the
// admin API, which alone adds branches and switches them on or off (decision 2026-11-16:
// extra branches are billed, so only Gearva changes how many a garage has). Every
// function takes the transaction and the garage, and filters by it.

export function toBranchItem(b: Branch): BranchItem {
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
export function nextBranchCode(existing: string[]): string {
  const numbers = existing.map((c) => Number(/^BR(\d+)$/.exec(c)?.[1] ?? 0));
  return `BR${Math.max(0, ...numbers) + 1}`;
}

export function branchNotFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Branch not found');
}

/** A new branch with the next code; `run` retries a code taken at the same moment. */
export async function createBranch(
  run: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>,
  garageId: string,
  input: CreateBranchInput,
): Promise<Branch> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run(async (tx) => {
        const codes = await tx.branch.findMany({ where: { garageId }, select: { code: true } });
        return tx.branch.create({
          data: {
            garageId,
            name: input.name,
            address: input.address ?? null,
            phone: input.phone ?? null,
            code: nextBranchCode(codes.map((c) => c.code)),
          },
        });
      });
    } catch (error) {
      const duplicate =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!duplicate || attempt >= 2) throw error;
    }
  }
}

/**
 * Changes a branch of this garage. The main branch is never switched off, and a branch
 * with active staff is not switched off: work is recorded per branch (visits, invoices),
 * so those people are moved or deactivated first.
 */
export async function updateBranch(
  tx: Prisma.TransactionClient,
  garageId: string,
  branchId: string,
  input: UpdateBranchInput,
): Promise<Branch> {
  const current = await tx.branch.findFirst({ where: { id: branchId, garageId } });
  if (!current) throw branchNotFound();
  if (input.isActive === false && current.isMain) {
    throw new AppException(
      HttpStatus.CONFLICT,
      ERROR_CODES.MAIN_BRANCH_REQUIRED,
      'The main branch cannot be deactivated',
    );
  }
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
}
