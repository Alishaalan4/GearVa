import { HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES, type ServiceTypeItem } from '@gearva/contracts';
import type { ServiceType, TenantTx } from '@gearva/database';
import { TenantDb } from '../common/db/tenant-db';
import { AppException } from '../common/errors/app-exception';

export function toServiceTypeItem(type: ServiceType): ServiceTypeItem {
  return {
    id: type.id,
    code: type.code,
    nameEn: type.nameEn,
    nameAr: type.nameAr,
    defaultIntervalKm: type.defaultIntervalKm,
    defaultIntervalMi: type.defaultIntervalMi,
    defaultIntervalMonths: type.defaultIntervalMonths,
    detailKey: type.detailKey,
  };
}

export interface ResolvedServiceType {
  /** the row the request named (stored on the record) */
  row: ServiceType;
  /** the garage's override for that code when it has one, else the row: its intervals apply */
  effective: ServiceType;
}

/**
 * Service types (database.md 4.4): global defaults (garageId null) and garage overrides.
 * RLS lets a garage read both and never another garage's overrides; the explicit
 * `garageId` conditions below are the first line of defense (README 5.1).
 */
@Injectable()
export class ServiceTypesService {
  constructor(private readonly db: TenantDb) {}

  /** The list a mechanic taps: one entry per code, the garage's override first. */
  async list(): Promise<ServiceTypeItem[]> {
    const garageId = this.db.garageId;
    const rows = await this.db.run((tx) =>
      tx.serviceType.findMany({
        where: { isActive: true, OR: [{ garageId: null }, { garageId }] },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      }),
    );
    const byCode = new Map<string, ServiceType>();
    for (const row of rows) {
      const seen = byCode.get(row.code);
      if (!seen || (row.garageId !== null && seen.garageId === null)) byCode.set(row.code, row);
    }
    return [...byCode.values()].map(toServiceTypeItem);
  }

  /** flow.md 6: the named type, and the row whose intervals apply (override ?? global). */
  async resolve(
    tx: TenantTx,
    garageId: string,
    serviceTypeId: string,
  ): Promise<ResolvedServiceType> {
    const row = await tx.serviceType.findFirst({
      where: { id: serviceTypeId, OR: [{ garageId: null }, { garageId }] },
    });
    if (!row) {
      throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Service type not found');
    }
    if (row.garageId !== null) return { row, effective: row };
    const override = await tx.serviceType.findFirst({ where: { garageId, code: row.code } });
    return { row, effective: override ?? row };
  }
}
