import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type CreateGlobalServiceTypeInput,
  ERROR_CODES,
  type GlobalServiceTypeItem,
  type UpdateGlobalServiceTypeInput,
} from '@gearva/contracts';
import { Prisma, type ServiceType } from '@gearva/database';
import { PlatformDb } from '../../common/db/platform-db';
import { AppException } from '../../common/errors/app-exception';

function notFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Service type not found');
}

/**
 * The default service types (flow.md 11.4, database.md 4.4): the global rows, read by
 * every garage, which keeps its own overrides. Changing a default never changes a
 * garage's override, and records already saved keep their due values.
 */
@Injectable()
export class AdminServiceTypesService {
  constructor(private readonly platformDb: PlatformDb) {}

  async list(): Promise<GlobalServiceTypeItem[]> {
    const db = this.platformDb.client;
    const types = await db.serviceType.findMany({
      where: { garageId: null },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    const overrides = await db.serviceType.groupBy({
      by: ['code'],
      where: { garageId: { not: null } },
      _count: { _all: true },
    });
    const counts = new Map(overrides.map((o) => [o.code, o._count._all]));
    return types.map((t) => toItem(t, counts.get(t.code) ?? 0));
  }

  async create(input: CreateGlobalServiceTypeInput): Promise<GlobalServiceTypeItem> {
    try {
      const created = await this.platformDb.client.serviceType.create({
        data: { ...input, garageId: null, detailKey: null },
      });
      return toItem(created, 0);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.SERVICE_TYPE_CODE_EXISTS,
          'A default service type with this code already exists',
        );
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateGlobalServiceTypeInput): Promise<GlobalServiceTypeItem> {
    const db = this.platformDb.client;
    const current = await db.serviceType.findFirst({ where: { id, garageId: null } });
    if (!current) throw notFound();
    const updated = await db.serviceType.update({ where: { id }, data: input });
    const overrideCount = await db.serviceType.count({
      where: { code: updated.code, garageId: { not: null } },
    });
    return toItem(updated, overrideCount);
  }
}

function toItem(t: ServiceType, overrideCount: number): GlobalServiceTypeItem {
  return {
    id: t.id,
    code: t.code,
    nameEn: t.nameEn,
    nameAr: t.nameAr,
    defaultIntervalKm: t.defaultIntervalKm,
    defaultIntervalMi: t.defaultIntervalMi,
    defaultIntervalMonths: t.defaultIntervalMonths,
    detailKey: t.detailKey,
    sortOrder: t.sortOrder,
    isActive: t.isActive,
    overrideCount,
  };
}
