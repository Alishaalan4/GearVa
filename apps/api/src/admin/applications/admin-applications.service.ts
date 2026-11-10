import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type ApplicationDetail,
  type ApplicationListItem,
  type ApplicationListQuery,
  type CreateGarageInput,
  ERROR_CODES,
  type GarageDetail,
  type Paginated,
  type RejectApplicationInput,
} from '@gearva/contracts';
import type { GarageApplication, Prisma } from '@gearva/database';
import { RequestContext } from '../../common/context/request-context';
import { PlatformDb } from '../../common/db/platform-db';
import { AppException } from '../../common/errors/app-exception';
import { paginated, toSkipTake } from '../../common/pagination';
import { AdminGaragesService } from '../garages/admin-garages.service';

function toListItem(a: GarageApplication): ApplicationListItem {
  return {
    id: a.id,
    garageName: a.garageName,
    ownerName: a.ownerName,
    email: a.email,
    phone: a.phone,
    city: a.city,
    branchCount: a.branchCount,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
  };
}

function alreadyReviewed(): AppException {
  return new AppException(
    HttpStatus.CONFLICT,
    ERROR_CODES.APPLICATION_ALREADY_REVIEWED,
    'This application was already approved or rejected',
  );
}

/**
 * The admin Applications page (flow.md 11.6): new applications first; approving creates
 * the garage (with its owner invite) and links it, rejecting needs a reason.
 */
@Injectable()
export class AdminApplicationsService {
  constructor(
    private readonly platformDb: PlatformDb,
    private readonly context: RequestContext,
    private readonly garages: AdminGaragesService,
  ) {}

  async list(query: ApplicationListQuery): Promise<Paginated<ApplicationListItem>> {
    const where: Prisma.GarageApplicationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: (['garageName', 'ownerName', 'email', 'phone'] as const).map((field) => ({
              [field]: { contains: query.q, mode: 'insensitive' },
            })),
          }
        : {}),
    };
    const db = this.platformDb.client;
    const [items, total] = await Promise.all([
      db.garageApplication.findMany({
        where,
        // The enum's order is NEW, APPROVED, REJECTED: new ones come first.
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(query),
      }),
      db.garageApplication.count({ where }),
    ]);
    return paginated(items.map(toListItem), total, query);
  }

  async detail(id: string): Promise<ApplicationDetail> {
    const db = this.platformDb.client;
    const a = await db.garageApplication.findUnique({
      where: { id },
      include: { reviewedBy: { select: { id: true, name: true } } },
    });
    if (!a) {
      throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Application not found');
    }
    const earlier = await db.garageApplication.findMany({
      where: { id: { not: a.id }, OR: [{ email: a.email }, { phone: a.phone }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });
    return {
      ...toListItem(a),
      message: a.message,
      reviewedBy: a.reviewedBy,
      reviewedAt: a.reviewedAt?.toISOString() ?? null,
      rejectReason: a.rejectReason,
      garageId: a.garageId,
      earlier: earlier.map(toListItem),
    };
  }

  /**
   * Creates the garage from the admin's form (filled in from the application, and
   * editable) and marks the application APPROVED in the same transaction. If someone
   * reviewed it meanwhile, nothing is created.
   */
  async approve(id: string, input: CreateGarageInput): Promise<GarageDetail> {
    const adminId = this.adminId();
    const current = await this.detail(id);
    if (current.status !== 'NEW') throw alreadyReviewed();
    return this.garages.create(input, async (tx, garageId) => {
      const { count } = await tx.garageApplication.updateMany({
        where: { id, status: 'NEW' },
        data: { status: 'APPROVED', garageId, reviewedById: adminId, reviewedAt: new Date() },
      });
      if (count !== 1) throw alreadyReviewed();
    });
  }

  async reject(id: string, input: RejectApplicationInput): Promise<ApplicationDetail> {
    const adminId = this.adminId();
    await this.detail(id);
    const { count } = await this.platformDb.client.garageApplication.updateMany({
      where: { id, status: 'NEW' },
      data: {
        status: 'REJECTED',
        rejectReason: input.reason,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
    });
    if (count !== 1) throw alreadyReviewed();
    return this.detail(id);
  }

  private adminId(): string {
    const adminId = this.context.actor?.id;
    if (!adminId) throw new Error('reviewing an application needs an admin actor');
    return adminId;
  }
}
