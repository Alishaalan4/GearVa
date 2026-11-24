import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  type CreateCustomerInput,
  type CreateCustomerResponse,
  type CustomerDetail,
  type CustomerListItem,
  type CustomerListQuery,
  ERROR_CODES,
  type OwnerAppStatus,
  type Paginated,
  type UpdateCustomerInput,
} from '@gearva/contracts';
import { type Notification, Prisma, type TenantTx } from '@gearva/database';
import { AuditService } from '../audit/audit.service';
import { newAccessLink } from '../auth/access-links';
import { TenantDb } from '../common/db/tenant-db';
import { AppException } from '../common/errors/app-exception';
import { paginated, toSkipTake } from '../common/pagination';
import { ENV, type Env } from '../config/env';
import { NotificationsService } from '../notifications/notifications.service';
import { toCustomerSummary, toVehicleItem } from './mappers';

export function customerNotFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Customer not found');
}

function appAlreadyActive(): AppException {
  return new AppException(
    HttpStatus.CONFLICT,
    ERROR_CODES.OWNER_APP_ALREADY_ACTIVE,
    'This person already uses the owner app; their cars from this garage appear there',
  );
}

type InviteOutcome = 'INVITED' | 'ALREADY_ACTIVE' | 'EMAIL_USED';

/**
 * A garage's customers (flow.md 3.1, database.md 4.3). The phone belongs to the global
 * owner, reached only through find_or_create_owner() and the linked-only read policy
 * (database.md 6.6); everything else is the garage's own data, always through TenantDb.
 */
@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly db: TenantDb,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * flow.md 3.1: find or create the owner by phone, then link them to this garage. A
   * phone this garage already has returns the existing customer (`created: false`).
   */
  async create(input: CreateCustomerInput): Promise<CreateCustomerResponse> {
    let outcome: { customerId: string; created: boolean; invite: Notification | null };
    try {
      outcome = await this.db.run((tx) => this.findOrLink(tx, input));
    } catch (error) {
      // Two requests adding the same phone at once: the second one finds the first.
      const duplicate =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!duplicate) throw error;
      outcome = await this.db.run((tx) => this.findOrLink(tx, input));
    }

    if (outcome.invite) {
      try {
        await this.notifications.dispatch(outcome.invite);
      } catch (error) {
        // The customer is saved; the row stays QUEUED (same rule as staff invites).
        this.logger.error(`Could not queue customer invite ${outcome.invite.id}`, error as Error);
      }
    }
    const detail = await this.load(outcome.customerId);
    return { ...detail, created: outcome.created };
  }

  /**
   * The garage's customers, newest first, one page at a time (README 5.4: paginated,
   * rate limited, never exported). `q` matches the name, or the end of the phone.
   */
  async list(query: CustomerListQuery): Promise<Paginated<CustomerListItem>> {
    const garageId = this.db.garageId;
    const q = query.q?.trim() ?? '';
    const digits = q.replace(/\D/g, '').replace(/^0+/, '');
    const filter: Prisma.GarageCustomerWhereInput = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            ...(digits.length >= 4 ? [{ owner: { phone: { endsWith: digits } } }] : []),
          ],
        }
      : {};
    const where: Prisma.GarageCustomerWhereInput = { garageId, deletedAt: null, ...filter };
    const [rows, total] = await this.db.run(
      async (tx) =>
        [
          await tx.garageCustomer.findMany({
            where,
            include: {
              owner: true,
              _count: { select: { vehicles: { where: { deletedAt: null } } } },
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            ...toSkipTake(query),
          }),
          await tx.garageCustomer.count({ where }),
        ] as const,
    );
    const items = rows.map((c): CustomerListItem => ({
      ...toCustomerSummary(c),
      vehicleCount: c._count.vehicles,
      createdAt: c.createdAt.toISOString(),
    }));
    return paginated(items, total, query);
  }

  /** The customer with their cars. Viewing a customer is audit logged (flow.md 12). */
  async detail(customerId: string): Promise<CustomerDetail> {
    const detail = await this.load(customerId);
    await this.audit.record({
      action: 'customer.view',
      entityType: 'customer',
      entityId: detail.id,
    });
    return detail;
  }

  async update(customerId: string, input: UpdateCustomerInput): Promise<CustomerDetail> {
    const garageId = this.db.garageId;
    await this.db.run(async (tx) => {
      const current = await tx.garageCustomer.findFirst({
        where: { id: customerId, garageId, deletedAt: null },
      });
      if (!current) throw customerNotFound();
      await tx.garageCustomer.update({
        where: { id: current.id },
        data: {
          name: input.name,
          notes: input.notes,
          email: input.email,
          remindersOptOut: input.remindersOptOut,
          marketingOptOut: input.marketingOptOut,
        },
      });
    });
    return this.load(customerId);
  }

  /**
   * flow.md 2.4 step 1, "Invite to the app": emails the customer a link to set the
   * password of their owner app account. Uses the garage's contact email for the customer,
   * which becomes the person's login. The owner row is changed only by invite_owner()
   * (database.md 6.6), inside this garage's transaction.
   */
  async inviteToApp(customerId: string): Promise<CustomerDetail> {
    const garageId = this.db.garageId;
    const invite = await this.db.run(async (tx) => {
      const customer = await tx.garageCustomer.findFirst({
        where: { id: customerId, garageId, deletedAt: null },
        include: { owner: true, garage: { select: { name: true } } },
      });
      if (!customer) throw customerNotFound();
      if (customer.owner.passwordHash) throw appAlreadyActive();
      const email = customer.email?.trim().toLowerCase();
      if (!email) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.CUSTOMER_EMAIL_REQUIRED,
          'Add the customer’s email first',
        );
      }

      const locale = customer.owner.locale === 'en' ? 'en' : 'ar';
      const link = newAccessLink(
        this.env.APP_URL_WEBSITE ?? this.env.APP_URL_GARAGE,
        'invite',
        `/${locale}/owner/set-password`,
      );
      const [row] = await tx.$queryRaw<{ outcome: InviteOutcome }[]>`
        SELECT invite_owner(${customer.ownerId}::uuid, ${email}, ${link.tokenHash},
                            ${link.expiresAt}::timestamptz) AS outcome`;
      if (row?.outcome === 'ALREADY_ACTIVE') throw appAlreadyActive();
      if (row?.outcome === 'EMAIL_USED') {
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.EMAIL_ALREADY_USED,
          'Another person uses this email for the owner app',
        );
      }
      if (row?.outcome !== 'INVITED') throw new Error('invite_owner returned no outcome');

      const sentAt = new Date();
      await tx.garageCustomer.update({
        where: { id: customer.id },
        data: { inviteSentAt: sentAt },
      });
      const { notification } = await this.notifications.record(tx, {
        garageId,
        ownerId: customer.ownerId,
        channel: 'EMAIL',
        type: 'INVITE',
        template: 'owner-invite',
        locale,
        recipient: email,
        payload: { name: customer.name, garageName: customer.garage.name, link: link.url },
        // One row per invite sent: "Send again" is a new intent.
        dedupeKey: `OWNER_INVITE:${customer.id}:${sentAt.getTime()}`,
        refType: 'customer',
        refId: customer.id,
      });
      return notification;
    });

    try {
      await this.notifications.dispatch(invite);
    } catch (error) {
      // The link is saved; the row stays QUEUED and the retry job picks it up (step 4.2).
      this.logger.error(`Could not queue owner invite ${invite.id}`, error as Error);
    }
    return this.load(customerId);
  }

  private async findOrLink(
    tx: TenantTx,
    input: CreateCustomerInput,
  ): Promise<{ customerId: string; created: boolean; invite: Notification | null }> {
    const garageId = this.db.garageId;
    const garage = await tx.garage.findUniqueOrThrow({
      where: { id: garageId },
      select: { name: true, defaultLocale: true },
    });
    const locale = garage.defaultLocale === 'en' ? 'en' : 'ar';
    // The owner's name and locale are used only when the phone is new (flow.md 3.1).
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      SELECT find_or_create_owner(${input.phone}, ${input.name}, ${locale}) AS id`;
    const ownerId = row?.id;
    if (!ownerId) throw new Error('find_or_create_owner returned no id');

    const existing = await tx.garageCustomer.findUnique({
      where: { garageId_ownerId: { garageId, ownerId } },
    });
    if (existing) {
      // A customer removed earlier comes back with the garage's history intact.
      if (existing.deletedAt) {
        await tx.garageCustomer.update({ where: { id: existing.id }, data: { deletedAt: null } });
      }
      return { customerId: existing.id, created: false, invite: null };
    }

    const customer = await tx.garageCustomer.create({
      data: {
        garageId,
        ownerId,
        name: input.name,
        notes: input.notes ?? null,
        email: input.email ?? null,
      },
    });
    // flow.md 3.1 step 5: invite the customer to the owner app. Staff do not enter an
    // email, so it waits for WhatsApp: the row is stored and logged as SKIPPED.
    const { notification } = await this.notifications.record(tx, {
      garageId,
      ownerId,
      channel: 'WHATSAPP',
      type: 'INVITE',
      template: 'customer-app-invite',
      locale,
      recipient: input.phone,
      payload: { name: input.name, garageName: garage.name },
      dedupeKey: `CUSTOMER_INVITE:${customer.id}`,
      refType: 'customer',
      refId: customer.id,
    });
    return { customerId: customer.id, created: true, invite: notification };
  }

  private async load(customerId: string): Promise<CustomerDetail> {
    const garageId = this.db.garageId;
    const customer = await this.db.run((tx) =>
      tx.garageCustomer.findFirst({
        where: { id: customerId, garageId, deletedAt: null },
        include: {
          owner: true,
          vehicles: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
        },
      }),
    );
    if (!customer) throw customerNotFound();
    // Whether the person uses the app, never their login email: another garage may have
    // sent the invite that set it (database.md 4.3: one garage never sees another's data).
    const appStatus: OwnerAppStatus = customer.owner.passwordHash
      ? 'ACTIVE'
      : customer.inviteSentAt
        ? 'INVITED'
        : 'NONE';
    return {
      ...toCustomerSummary(customer),
      notes: customer.notes,
      email: customer.email,
      remindersOptOut: customer.remindersOptOut,
      marketingOptOut: customer.marketingOptOut,
      createdAt: customer.createdAt.toISOString(),
      vehicles: customer.vehicles.map(toVehicleItem),
      appStatus,
      inviteSentAt: customer.inviteSentAt?.toISOString() ?? null,
    };
  }
}
