import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type AdminOwnerItem,
  type AdminOwnersQuery,
  type AdminStaffItem,
  type AdminStaffQuery,
  type AdminUserItem,
  type CreateAdminUserInput,
  ERROR_CODES,
  type OwnerAccountState,
  type Paginated,
  type SentLink,
  type UpdateAdminStaffInput,
  type UpdateAdminUserInput,
} from '@gearva/contracts';
import { type AdminUser, type Owner, Prisma, type User } from '@gearva/database';
import { AuditService } from '../../audit/audit.service';
import { PasswordService } from '../../auth/password.service';
import { SessionService } from '../../auth/session.service';
import { UserAccessLinksService } from '../../auth/user-access-links.service';
import { RequestContext } from '../../common/context/request-context';
import { PlatformDb } from '../../common/db/platform-db';
import { AppException } from '../../common/errors/app-exception';
import { paginated, toSkipTake } from '../../common/pagination';
import { OwnerAuthService } from '../../owners/owner-auth.service';
import { requireSuperAdmin } from '../admin-roles';

function notFound(what: string): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, `${what} not found`);
}

function toAdminItem(a: AdminUser): AdminUserItem {
  return {
    id: a.id,
    email: a.email,
    name: a.name,
    role: a.role,
    isActive: a.isActive,
    totpEnabled: a.totpEnabled,
    lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

const STAFF_INCLUDE = {
  garage: { select: { id: true, name: true } },
  branch: { select: { name: true } },
} satisfies Prisma.UserInclude;

function toStaffItem(
  u: User & { garage: { id: string; name: string }; branch: { name: string } | null },
): AdminStaffItem {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    garage: u.garage,
    branchName: u.branch?.name ?? null,
    isActive: u.isActive,
    hasPassword: u.passwordHash !== null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  };
}

function accountOf(owner: Pick<Owner, 'email' | 'passwordHash'>): OwnerAccountState {
  if (owner.passwordHash) return 'ACTIVE';
  return owner.email ? 'INVITED' : 'NONE';
}

/**
 * The super admin's Users page (flow.md 11.8, step 5.9): Gearva's admins, every garage's
 * staff and the car owners. Super admins only (checked on every call). Cross-garage, so
 * through the platform role; there is no single garage for admin_access_logs, so looking
 * at the owners list writes an audit row instead (flow.md 12). Every password change ends
 * that person's sessions and voids any open link.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly platformDb: PlatformDb,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly links: UserAccessLinksService,
    private readonly ownerAuth: OwnerAuthService,
    private readonly audit: AuditService,
    private readonly context: RequestContext,
  ) {}

  private get db() {
    return this.platformDb.client;
  }

  // -------------------------------------------------------------------------
  // Admins
  // -------------------------------------------------------------------------

  async listAdmins(): Promise<AdminUserItem[]> {
    requireSuperAdmin(this.context);
    const admins = await this.db.adminUser.findMany({ orderBy: { createdAt: 'asc' } });
    return admins.map(toAdminItem);
  }

  /** The super admin chooses the first password and tells the new admin (no email). */
  async createAdmin(input: CreateAdminUserInput): Promise<AdminUserItem> {
    requireSuperAdmin(this.context);
    try {
      const admin = await this.db.adminUser.create({
        data: {
          email: input.email,
          name: input.name,
          role: input.role,
          passwordHash: await this.passwords.hash(input.password),
        },
      });
      return toAdminItem(admin);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.EMAIL_ALREADY_USED,
          'An admin with this email already exists',
        );
      }
      throw error;
    }
  }

  /**
   * Name, role, on/off. Nobody deactivates or demotes themselves, and one active super
   * admin always remains. A deactivated admin is signed out at once.
   */
  async updateAdmin(adminId: string, input: UpdateAdminUserInput): Promise<AdminUserItem> {
    const actorId = requireSuperAdmin(this.context);
    const current = await this.db.adminUser.findUnique({ where: { id: adminId } });
    if (!current) throw notFound('Admin');
    const role = input.role ?? current.role;
    const isActive = input.isActive ?? current.isActive;
    if (adminId === actorId && (!isActive || role !== current.role)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.CANNOT_MODIFY_SELF,
        'You cannot deactivate yourself or change your own role',
      );
    }
    const losesSuper =
      current.role === 'SUPER_ADMIN' && current.isActive && (role !== 'SUPER_ADMIN' || !isActive);
    if (losesSuper) {
      const others = await this.db.adminUser.count({
        where: { role: 'SUPER_ADMIN', isActive: true, id: { not: adminId } },
      });
      if (others === 0) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.LAST_SUPER_ADMIN,
          'There must always be one active super admin',
        );
      }
    }
    const admin = await this.db.adminUser.update({
      where: { id: adminId },
      data: { name: input.name, role, isActive },
    });
    if (!isActive) await this.sessions.revokeAll('ADMIN', adminId);
    return toAdminItem(admin);
  }

  async setAdminPassword(adminId: string, password: string): Promise<void> {
    requireSuperAdmin(this.context);
    const admin = await this.db.adminUser.findUnique({ where: { id: adminId } });
    if (!admin) throw notFound('Admin');
    await this.db.adminUser.update({
      where: { id: adminId },
      data: { passwordHash: await this.passwords.hash(password) },
    });
    await this.sessions.revokeAll('ADMIN', adminId);
  }

  /** A lost phone: 2FA off, its secret and recovery codes deleted; they can turn it on again. */
  async resetAdminTotp(adminId: string): Promise<AdminUserItem> {
    requireSuperAdmin(this.context);
    const admin = await this.db.adminUser.findUnique({ where: { id: adminId } });
    if (!admin) throw notFound('Admin');
    const updated = await this.db.adminUser.update({
      where: { id: adminId },
      data: { totpEnabled: false, totpSecretEnc: null, recoveryCodesHash: [] },
    });
    return toAdminItem(updated);
  }

  // -------------------------------------------------------------------------
  // Garage staff
  // -------------------------------------------------------------------------

  async listStaff(query: AdminStaffQuery): Promise<Paginated<AdminStaffItem>> {
    requireSuperAdmin(this.context);
    const q = query.q?.trim();
    const where: Prisma.UserWhereInput = {
      garage: { deletedAt: null },
      ...(query.role ? { role: query.role } : {}),
      ...(query.garageId ? { garageId: query.garageId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q.toLowerCase() } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.user.findMany({
        where,
        include: STAFF_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(query),
      }),
      this.db.user.count({ where }),
    ]);
    return paginated(rows.map(toStaffItem), total, query);
  }

  /** An invite link if the person never set a password, else a reset link (flow.md 2.1). */
  async sendStaffLink(userId: string): Promise<SentLink> {
    requireSuperAdmin(this.context);
    const user = await this.db.user.findFirst({
      where: { id: userId, garage: { deletedAt: null } },
      include: { garage: true },
    });
    if (!user) throw notFound('User');
    if (!user.isActive) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.BAD_REQUEST,
        'Reactivate this person before sending a link',
      );
    }
    const kind = user.passwordHash ? 'reset' : 'invite';
    const notification = await this.db.$transaction((tx) =>
      this.links.issue(tx, user, user.garage.name, kind),
    );
    await this.links.dispatch(notification);
    return { kind, email: user.email };
  }

  async setStaffPassword(userId: string, password: string): Promise<void> {
    requireSuperAdmin(this.context);
    const user = await this.db.user.findFirst({
      where: { id: userId, garage: { deletedAt: null } },
    });
    if (!user) throw notFound('User');
    await this.db.user.update({
      where: { id: userId },
      data: {
        passwordHash: await this.passwords.hash(password),
        inviteTokenHash: null,
        inviteExpiresAt: null,
      },
    });
    await this.sessions.revokeAll('STAFF', userId);
  }

  /**
   * On or off. A garage's owner is not switched off here (suspend the garage instead), and
   * nobody comes back into a branch that is switched off.
   */
  async updateStaff(userId: string, input: UpdateAdminStaffInput): Promise<AdminStaffItem> {
    requireSuperAdmin(this.context);
    const user = await this.db.user.findFirst({
      where: { id: userId, garage: { deletedAt: null } },
      include: { branch: true },
    });
    if (!user) throw notFound('User');
    if (user.role === 'OWNER' && !input.isActive) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.CANNOT_MODIFY_OWNER,
        'Suspend the garage instead of deactivating its owner',
      );
    }
    if (input.isActive && user.branch && !user.branch.isActive) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.BRANCH_INACTIVE,
        'This person works in a branch that is switched off',
      );
    }
    const updated = await this.db.user.update({
      where: { id: userId },
      data: { isActive: input.isActive },
      include: STAFF_INCLUDE,
    });
    if (!input.isActive) await this.sessions.revokeAll('STAFF', userId);
    return toStaffItem(updated);
  }

  // -------------------------------------------------------------------------
  // Car owners
  // -------------------------------------------------------------------------

  async listOwners(query: AdminOwnersQuery): Promise<Paginated<AdminOwnerItem>> {
    requireSuperAdmin(this.context);
    const q = query.q?.trim();
    const digits = q?.replace(/\D/g, '').replace(/^0+/, '') ?? '';
    const filters: Prisma.OwnerWhereInput[] = [];
    if (q) {
      filters.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q.toLowerCase() } },
          ...(digits.length >= 4 ? [{ phone: { endsWith: digits } }] : []),
        ],
      });
    }
    if (query.account === 'ACTIVE') filters.push({ passwordHash: { not: null } });
    if (query.account === 'INVITED') filters.push({ email: { not: null }, passwordHash: null });
    if (query.account === 'NONE') filters.push({ email: null });
    const where: Prisma.OwnerWhereInput = filters.length ? { AND: filters } : {};

    const [rows, total] = await Promise.all([
      this.db.owner.findMany({
        where,
        include: {
          garageCustomers: {
            where: { deletedAt: null, garage: { deletedAt: null } },
            include: { garage: { select: { id: true, name: true } } },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(query),
      }),
      this.db.owner.count({ where }),
    ]);
    // Personal data across garages: who looked, and for what (flow.md 12).
    await this.audit.record({
      action: 'admin.users.owners.view',
      entityType: 'owner',
      after: { q: q ?? null, account: query.account ?? null, page: query.page },
    });
    const items = rows.map((o): AdminOwnerItem => ({
      id: o.id,
      name: o.name,
      phone: o.phone,
      email: o.email,
      account: accountOf(o),
      garages: o.garageCustomers.map((c) => c.garage),
      lastLoginAt: o.lastLoginAt?.toISOString() ?? null,
    }));
    return paginated(items, total, query);
  }

  /** The set-password link to the login email (also for someone invited who never used it). */
  async sendOwnerLink(ownerId: string): Promise<SentLink> {
    requireSuperAdmin(this.context);
    const owner = await this.ownerWithEmail(ownerId);
    const sent = await this.ownerAuth.sendResetLink(owner);
    if (!sent) throw notFound('Garage customer');
    return { kind: owner.passwordHash ? 'reset' : 'invite', email: owner.email };
  }

  async setOwnerPassword(ownerId: string, password: string): Promise<void> {
    requireSuperAdmin(this.context);
    await this.ownerWithEmail(ownerId);
    await this.ownerAuth.setPasswordFor(ownerId, password);
  }

  /** Closes the app account (as the owner can in the app); garage records stay. */
  async closeOwnerAccount(ownerId: string): Promise<void> {
    requireSuperAdmin(this.context);
    const owner = await this.db.owner.findUnique({ where: { id: ownerId } });
    if (!owner) throw notFound('Owner');
    await this.ownerAuth.closeAppAccount(ownerId);
  }

  private async ownerWithEmail(ownerId: string): Promise<Owner & { email: string }> {
    const owner = await this.db.owner.findUnique({ where: { id: ownerId } });
    if (!owner) throw notFound('Owner');
    if (!owner.email) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.NO_LOGIN_EMAIL,
        'This person has no app login email: a garage must invite them first',
      );
    }
    return { ...owner, email: owner.email };
  }
}
