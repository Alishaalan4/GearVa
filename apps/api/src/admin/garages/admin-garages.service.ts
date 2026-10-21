import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  type CreateGarageInput,
  ERROR_CODES,
  type GarageDetail,
  type GarageListItem,
  type GarageListQuery,
  type Paginated,
  type SuspendGarageInput,
  TRIAL_DAYS,
} from '@gearva/contracts';
import { Prisma, type Garage, type Notification } from '@gearva/database';
import { RESET_LINK_HOURS, newAccessLink } from '../../auth/access-links';
import { RequestContext } from '../../common/context/request-context';
import { PlatformDb } from '../../common/db/platform-db';
import { AppException } from '../../common/errors/app-exception';
import { paginated, toSkipTake } from '../../common/pagination';
import { ENV, type Env } from '../../config/env';
import { NotificationsService } from '../../notifications/notifications.service';

type Tx = Prisma.TransactionClient;

const garageWithCounts = {
  _count: { select: { branches: { where: { isActive: true } } } },
} satisfies Prisma.GarageInclude;

type GarageWithCounts = Prisma.GarageGetPayload<{ include: typeof garageWithCounts }>;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toListItem(g: GarageWithCounts): GarageListItem {
  return {
    id: g.id,
    name: g.name,
    email: g.email,
    phone: g.phone,
    status: g.status,
    isPaid: g.isPaid,
    trialEndsAt: iso(g.trialEndsAt),
    expiresAt: iso(g.expiresAt),
    branchCount: g._count.branches,
    lastLoginAt: iso(g.lastLoginAt),
    createdAt: g.createdAt.toISOString(),
  };
}

function notFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Garage not found');
}

/**
 * Admin garage management (flow.md 2.1 and 11.1). Admins work outside any tenant, so
 * this uses the platform role; it touches garage account data only (garage, settings,
 * branches, the owner's login), never a garage's customers.
 */
@Injectable()
export class AdminGaragesService {
  constructor(
    private readonly platformDb: PlatformDb,
    private readonly notifications: NotificationsService,
    private readonly context: RequestContext,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * flow.md 2.1: garage + default settings + main branch BR1 + OWNER without password,
   * in one transaction, plus the queued invite email. The email is sent after commit.
   */
  async create(input: CreateGarageInput): Promise<GarageDetail> {
    const adminId = this.context.actor?.id;
    if (!adminId) throw new Error('create garage needs an admin actor');
    const now = new Date();
    const link = newAccessLink(this.env.APP_URL_GARAGE, 'invite');

    let invite: Notification;
    let garageId: string;
    try {
      ({ garageId, invite } = await this.platformDb.client.$transaction(async (tx) => {
        const garage = await tx.garage.create({
          data: {
            name: input.name,
            email: input.email,
            phone: input.phone,
            locationText: input.locationText,
            timezone: input.timezone,
            defaultLocale: input.defaultLocale,
            createdByAdminId: adminId,
            ...(input.plan === 'TRIAL'
              ? {
                  status: 'TRIAL',
                  isPaid: false,
                  trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
                }
              : {
                  status: 'ACTIVE',
                  isPaid: true,
                  expiresAt: new Date(`${input.paidUntil}T23:59:59.999Z`),
                }),
            settings: { create: {} },
            branches: { create: { name: input.name, code: 'BR1', isMain: true } },
          },
        });
        const owner = await tx.user.create({
          data: {
            garageId: garage.id,
            email: input.email,
            name: input.ownerName,
            role: 'OWNER',
            locale: input.defaultLocale,
            inviteTokenHash: link.tokenHash,
            inviteExpiresAt: link.expiresAt,
          },
        });
        const { notification } = await this.recordInvite(tx, garage, owner, link.url, now);
        return { garageId: garage.id, invite: notification };
      }));
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

    await this.notifications.dispatch(invite);
    return this.detail(garageId);
  }

  async list(query: GarageListQuery): Promise<Paginated<GarageListItem>> {
    const where: Prisma.GarageWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const db = this.platformDb.client;
    const [items, total] = await Promise.all([
      db.garage.findMany({
        where,
        include: garageWithCounts,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
      }),
      db.garage.count({ where }),
    ]);
    return paginated(items.map(toListItem), total, query);
  }

  async detail(garageId: string): Promise<GarageDetail> {
    const garage = await this.platformDb.client.garage.findFirst({
      where: { id: garageId, deletedAt: null },
      include: {
        ...garageWithCounts,
        branches: { orderBy: [{ isMain: 'desc' }, { code: 'asc' }] },
        users: { where: { role: 'OWNER' }, take: 1 },
      },
    });
    if (!garage) throw notFound();
    const owner = garage.users[0];
    return {
      ...toListItem(garage),
      locationText: garage.locationText,
      timezone: garage.timezone,
      defaultLocale: garage.defaultLocale === 'ar' ? 'ar' : 'en',
      suspendedAt: iso(garage.suspendedAt),
      suspendedReason: garage.suspendedReason,
      owner: owner
        ? {
            id: owner.id,
            name: owner.name,
            email: owner.email,
            hasPassword: owner.passwordHash !== null,
            linkExpiresAt: iso(owner.inviteExpiresAt),
            lastLoginAt: iso(owner.lastLoginAt),
          }
        : null,
      branches: garage.branches.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        isMain: b.isMain,
        isActive: b.isActive,
      })),
    };
  }

  /** flow.md 2.1 step 5: a new invite link, while the owner has not set a password yet. */
  async resendInvite(garageId: string): Promise<GarageDetail> {
    const { garage, owner } = await this.garageAndOwner(garageId);
    if (owner.passwordHash) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.OWNER_ALREADY_ACTIVE,
        'The owner already set a password. Send a password reset instead.',
      );
    }
    const link = newAccessLink(this.env.APP_URL_GARAGE, 'invite');
    const now = new Date();
    const invite = await this.platformDb.client.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: owner.id },
        data: { inviteTokenHash: link.tokenHash, inviteExpiresAt: link.expiresAt },
      });
      return (await this.recordInvite(tx, garage, owner, link.url, now)).notification;
    });
    await this.notifications.dispatch(invite);
    return this.detail(garageId);
  }

  /** flow.md 2.1 step 5: a reset link for an owner who already has a password. */
  async sendPasswordReset(garageId: string): Promise<GarageDetail> {
    const { garage, owner } = await this.garageAndOwner(garageId);
    if (!owner.passwordHash) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.OWNER_NOT_ACTIVATED,
        'The owner has not set a password yet. Resend the invite instead.',
      );
    }
    const link = newAccessLink(this.env.APP_URL_GARAGE, 'reset');
    const now = new Date();
    const reset = await this.platformDb.client.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: owner.id },
        data: { inviteTokenHash: link.tokenHash, inviteExpiresAt: link.expiresAt },
      });
      const { notification } = await this.notifications.record(tx, {
        garageId: garage.id,
        userId: owner.id,
        channel: 'EMAIL',
        type: 'INVITE',
        template: 'password-reset',
        locale: owner.locale === 'ar' ? 'ar' : 'en',
        recipient: owner.email,
        payload: { name: owner.name, link: link.url, hours: RESET_LINK_HOURS },
        dedupeKey: `PASSWORD_RESET:${owner.id}:${now.getTime()}`,
        refType: 'user',
        refId: owner.id,
      });
      return notification;
    });
    await this.notifications.dispatch(reset);
    return this.detail(garageId);
  }

  /** flow.md 11.1: the lock guard (step 1.6) blocks the garage from the next request on. */
  async suspend(garageId: string, input: SuspendGarageInput): Promise<GarageDetail> {
    const garage = await this.activeGarage(garageId);
    if (garage.status === 'SUSPENDED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.GARAGE_ALREADY_SUSPENDED,
        'The garage is already suspended',
      );
    }
    await this.platformDb.client.garage.update({
      where: { id: garage.id },
      data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendedReason: input.reason },
    });
    return this.detail(garageId);
  }

  /** Back to TRIAL or ACTIVE; an elapsed trial or paid period still locks it. */
  async reactivate(garageId: string): Promise<GarageDetail> {
    const garage = await this.activeGarage(garageId);
    if (garage.status !== 'SUSPENDED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.GARAGE_NOT_SUSPENDED,
        'The garage is not suspended',
      );
    }
    await this.platformDb.client.garage.update({
      where: { id: garage.id },
      data: {
        status: !garage.isPaid && garage.trialEndsAt ? 'TRIAL' : 'ACTIVE',
        suspendedAt: null,
        suspendedReason: null,
      },
    });
    return this.detail(garageId);
  }

  private recordInvite(
    tx: Tx,
    garage: Garage,
    owner: { id: string; name: string; email: string; locale: string },
    url: string,
    now: Date,
  ) {
    return this.notifications.record(tx, {
      garageId: garage.id,
      userId: owner.id,
      channel: 'EMAIL',
      type: 'INVITE',
      template: 'staff-invite',
      locale: owner.locale === 'ar' ? 'ar' : 'en',
      recipient: owner.email,
      payload: { name: owner.name, garageName: garage.name, link: url },
      // One row per issued link: a resend is a new intent, a retried request is not.
      dedupeKey: `INVITE:${owner.id}:${now.getTime()}`,
      refType: 'user',
      refId: owner.id,
    });
  }

  private async activeGarage(garageId: string): Promise<Garage> {
    const garage = await this.platformDb.client.garage.findFirst({
      where: { id: garageId, deletedAt: null },
    });
    if (!garage) throw notFound();
    return garage;
  }

  private async garageAndOwner(garageId: string) {
    const garage = await this.activeGarage(garageId);
    const owner = await this.platformDb.client.user.findFirst({
      where: { garageId: garage.id, role: 'OWNER' },
    });
    if (!owner) throw notFound();
    return { garage, owner };
  }
}
