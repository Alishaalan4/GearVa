import { HttpStatus, Injectable } from '@nestjs/common';
import {
  BRANCH_BOUND_ROLES,
  ERROR_CODES,
  type InviteStaffInput,
  type Paginated,
  type PaginationQuery,
  type StaffItem,
  type UpdateStaffInput,
} from '@gearva/contracts';
import { type Notification, Prisma, type TenantTx, type User } from '@gearva/database';
import { SessionService } from '../auth/session.service';
import { UserAccessLinksService } from '../auth/user-access-links.service';
import { TenantDb } from '../common/db/tenant-db';
import { AppException } from '../common/errors/app-exception';
import { paginated, toSkipTake } from '../common/pagination';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toItem(u: User): StaffItem {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    locale: u.locale === 'ar' ? 'ar' : 'en',
    branchId: u.branchId,
    isActive: u.isActive,
    hasPassword: u.passwordHash !== null,
    linkExpiresAt: iso(u.inviteExpiresAt),
    lastLoginAt: iso(u.lastLoginAt),
    createdAt: u.createdAt.toISOString(),
  };
}

function notFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Staff member not found');
}

/**
 * Garage staff management by the OWNER (flow.md 1): invite with a role and branch,
 * change, deactivate, resend the invite or send a password reset. The OWNER account
 * itself is managed by the admin (flow.md 2.1), never here.
 * All queries run in TenantDb and filter by the context's garageId.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly db: TenantDb,
    private readonly links: UserAccessLinksService,
    private readonly sessions: SessionService,
  ) {}

  async list(query: PaginationQuery): Promise<Paginated<StaffItem>> {
    const garageId = this.db.garageId;
    const [items, total] = await this.db.run(
      async (tx) =>
        [
          await tx.user.findMany({
            where: { garageId },
            orderBy: { createdAt: 'asc' },
            ...toSkipTake(query),
          }),
          await tx.user.count({ where: { garageId } }),
        ] as const,
    );
    return paginated(items.map(toItem), total, query);
  }

  async invite(input: InviteStaffInput): Promise<StaffItem> {
    const garageId = this.db.garageId;
    let created: { user: User; invite: Notification };
    try {
      created = await this.db.run(async (tx) => {
        if (input.branchId) await assertBranch(tx, garageId, input.branchId);
        const garage = await tx.garage.findUniqueOrThrow({ where: { id: garageId } });
        const user = await tx.user.create({
          data: {
            garageId,
            name: input.name,
            email: input.email,
            role: input.role,
            branchId: input.branchId,
            locale: input.locale,
          },
        });
        const invite = await this.links.issue(tx, user, garage.name, 'invite');
        return { user: await tx.user.findUniqueOrThrow({ where: { id: user.id } }), invite };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.EMAIL_ALREADY_USED,
          'This email is already used by another account',
        );
      }
      throw error;
    }
    await this.links.dispatch(created.invite);
    return toItem(created.user);
  }

  async update(userId: string, input: UpdateStaffInput): Promise<StaffItem> {
    const garageId = this.db.garageId;
    const user = await this.db.run(async (tx) => {
      const current = await this.staffMember(tx, garageId, userId);

      // The rules apply to the result, not only to the fields that were sent.
      const role = input.role ?? current.role;
      const branchId = input.branchId === undefined ? current.branchId : input.branchId;
      const isActive = input.isActive ?? current.isActive;
      // A new branch must exist in this garage and be active. An active member also may
      // not stay in (or be reactivated into) a branch that was switched off.
      const branchChanged = input.branchId !== undefined && input.branchId !== current.branchId;
      const reactivated = input.isActive === true && !current.isActive;
      if (branchId && (branchChanged || (isActive && reactivated))) {
        await assertBranch(tx, garageId, branchId);
      }
      if (BRANCH_BOUND_ROLES.includes(role) && !branchId) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.VALIDATION_FAILED,
          'Mechanics and receptionists need a branch',
          {
            issues: [{ path: ['branchId'], message: 'Mechanics and receptionists need a branch' }],
          },
        );
      }
      return tx.user.update({
        where: { id: current.id },
        data: { name: input.name, role, branchId, isActive: input.isActive },
      });
    });
    // A deactivated member is signed out everywhere at once.
    if (input.isActive === false) await this.sessions.revokeAll('STAFF', user.id);
    return toItem(user);
  }

  /** A new invite link while the member has not set a password yet. */
  async resendInvite(userId: string): Promise<StaffItem> {
    return this.sendLink(userId, 'invite');
  }

  /** A 24-hour reset link for a member who already has a password. */
  async sendPasswordReset(userId: string): Promise<StaffItem> {
    return this.sendLink(userId, 'reset');
  }

  private async sendLink(userId: string, kind: 'invite' | 'reset'): Promise<StaffItem> {
    const garageId = this.db.garageId;
    const { user, notification } = await this.db.run(async (tx) => {
      const current = await this.staffMember(tx, garageId, userId);
      if (kind === 'invite' && current.passwordHash) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.USER_ALREADY_ACTIVE,
          'This person already set a password. Send a password reset instead.',
        );
      }
      if (kind === 'reset' && !current.passwordHash) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.USER_NOT_ACTIVATED,
          'This person has not set a password yet. Resend the invite instead.',
        );
      }
      const garage = await tx.garage.findUniqueOrThrow({ where: { id: garageId } });
      const sent = await this.links.issue(tx, current, garage.name, kind);
      return {
        user: await tx.user.findUniqueOrThrow({ where: { id: current.id } }),
        notification: sent,
      };
    });
    await this.links.dispatch(notification);
    return toItem(user);
  }

  /** A non-owner member of this garage, or 404 / 403. */
  private async staffMember(tx: TenantTx, garageId: string, userId: string): Promise<User> {
    const user = await tx.user.findFirst({ where: { id: userId, garageId } });
    if (!user) throw notFound();
    if (user.role === 'OWNER') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.CANNOT_MODIFY_OWNER,
        'The owner account is managed by Gearva support',
      );
    }
    return user;
  }
}

/** The branch exists in this garage (else 404, as for any other garage's id) and is active. */
async function assertBranch(tx: TenantTx, garageId: string, branchId: string): Promise<void> {
  const branch = await tx.branch.findFirst({ where: { id: branchId, garageId } });
  if (!branch) {
    throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Branch not found');
  }
  if (!branch.isActive) {
    throw new AppException(
      HttpStatus.CONFLICT,
      ERROR_CODES.BRANCH_INACTIVE,
      'This branch is deactivated. Choose an active branch.',
    );
  }
}
