import { Injectable } from '@nestjs/common';
import {
  type DistanceUnit,
  type Paginated,
  type SearchQuery,
  type SearchResult,
  normalizePlate,
} from '@gearva/contracts';
import { Prisma } from '@gearva/database';
import { TenantDb } from '../common/db/tenant-db';
import { paginated, toSkipTake } from '../common/pagination';

/** Only digits, spaces and + - ( ) . : what someone types for a phone number. */
const PHONE_LIKE = /^[\d\s+\-().]+$/;
/** A phone search needs at least this many digits, so "12" never lists half the garage. */
const MIN_PHONE_DIGITS = 4;

interface Row {
  customer_id: string;
  customer_name: string;
  phone: string;
  vehicle_id: string | null;
  plate: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  distance_unit: DistanceUnit | null;
  current_km: number | null;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * flow.md 3.3: one box for a plate or a phone, always inside the garage and paginated.
 * A plate matches by prefix of plateNormalized; a phone by its ending (so "03 123 456"
 * finds +9613123456). Runs in TenantDb, so RLS applies to every table it reads,
 * `owners` included (linked-only, database.md 6.6).
 */
@Injectable()
export class SearchService {
  constructor(private readonly db: TenantDb) {}

  async search(query: SearchQuery): Promise<Paginated<SearchResult>> {
    const garageId = this.db.garageId;
    const plate = normalizePlate(query.q);
    const digits = query.q.replace(/\D/g, '').replace(/^0+/, '');
    const byPhone = PHONE_LIKE.test(query.q) && digits.length >= MIN_PHONE_DIGITS;

    const plateMatch = plate
      ? Prisma.sql`(v."id" IS NOT NULL AND v."plate_normalized" LIKE ${`${escapeLike(plate)}%`})`
      : Prisma.sql`FALSE`;
    const phoneMatch = byPhone ? Prisma.sql`o."phone" LIKE ${`%${digits}`}` : Prisma.sql`FALSE`;
    const from = Prisma.sql`
      FROM "garage_customers" gc
      JOIN "owners" o ON o."id" = gc."owner_id"
      LEFT JOIN "vehicles" v
        ON v."garage_id" = gc."garage_id" AND v."garage_customer_id" = gc."id" AND v."deleted_at" IS NULL
      WHERE gc."garage_id" = ${garageId}::uuid AND gc."deleted_at" IS NULL
        AND (${plateMatch} OR ${phoneMatch})`;
    const { skip, take } = toSkipTake(query);

    const [rows, counted] = await this.db.run(
      async (tx) =>
        [
          await tx.$queryRaw<Row[]>`
        SELECT gc."id" AS customer_id, gc."name" AS customer_name, o."phone",
               v."id" AS vehicle_id, v."plate", v."make", v."model", v."year",
               v."distance_unit"::text AS distance_unit, v."current_km"
        ${from}
        ORDER BY (v."plate_normalized" = ${plate}) DESC NULLS LAST, gc."name", v."plate_normalized"
        LIMIT ${take} OFFSET ${skip}`,
          await tx.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) AS total ${from}`,
        ] as const,
    );

    const items = rows.map((r): SearchResult => ({
      customer: { id: r.customer_id, name: r.customer_name, phone: r.phone },
      vehicle:
        r.vehicle_id === null
          ? null
          : {
              id: r.vehicle_id,
              plate: r.plate as string,
              make: r.make as string,
              model: r.model as string,
              year: r.year,
              distanceUnit: r.distance_unit as DistanceUnit,
              currentKm: r.current_km as number,
            },
    }));
    return paginated(items, Number(counted[0]?.total ?? 0), query);
  }
}
