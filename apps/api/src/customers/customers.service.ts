import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  type CreateCustomerInput,
  type CreateCustomerResponse,
  type CustomerDetail,
  type CustomerListItem,
  type CustomerListQuery,
  ERROR_CODES,
  type Paginated,
  type UpdateCustomerInput,
} from '@gearva/contracts';
import { type Notification, Prisma, type TenantTx } from '@gearva/database';
import { AuditService } from '../audit/audit.service';
import { TenantDb } from '../common/db/tenant-db';
import { AppException } from '../common/errors/app-exception';
import { paginated, toSkipTake } from '../common/pagination';
import { NotificationsService } from '../notifications/notifications.service';
import { toCustomerSummary, toVehicleItem } from './mappers';

export function customerNotFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Customer not found');
}

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
          remindersOptOut: input.remindersOptOut,
          marketingOptOut: input.marketingOptOut,
        },
      });
    });
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
      data: { garageId, ownerId, name: input.name, notes: input.notes ?? null },
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
    return {
      ...toCustomerSummary(customer),
      notes: customer.notes,
      remindersOptOut: customer.remindersOptOut,
      marketingOptOut: customer.marketingOptOut,
      createdAt: customer.createdAt.toISOString(),
      vehicles: customer.vehicles.map(toVehicleItem),
    };
  }
}
