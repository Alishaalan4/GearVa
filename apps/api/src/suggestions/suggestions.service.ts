import { Injectable } from '@nestjs/common';
import {
  SUGGESTION_LIMIT,
  type SuggestionField,
  type SuggestionList,
  type SuggestionQuery,
  normalizeSuggestion,
} from '@gearva/contracts';
import type { TenantTx } from '@gearva/database';
import { TenantDb } from '../common/db/tenant-db';
import { uuidV7 } from '../common/uuid-v7';

/**
 * Per-garage autocomplete (flow.md 4.3). Lists are never shared between garages: every
 * query runs in TenantDb (RLS) and filters by the context's garage.
 */
@Injectable()
export class SuggestionsService {
  constructor(private readonly db: TenantDb) {}

  /** Values starting with `q` (case-insensitive), most used first. */
  async list(query: SuggestionQuery): Promise<SuggestionList> {
    const garageId = this.db.garageId;
    const prefix = normalizeSuggestion(query.q);
    const rows = await this.db.run((tx) =>
      tx.suggestion.findMany({
        where: {
          garageId,
          field: query.field,
          ...(prefix ? { valueNormalized: { startsWith: prefix } } : {}),
        },
        orderBy: [{ useCount: 'desc' }, { lastUsedAt: 'desc' }],
        take: SUGGESTION_LIMIT,
        select: { value: true, useCount: true },
      }),
    );
    return { items: rows };
  }

  /**
   * Called on save inside the caller's transaction (flow.md 4.3): a new value is created,
   * a known one counts one more use. One statement, so two saves at the same moment
   * cannot fail on each other. The display value keeps the first spelling used.
   */
  async record(
    tx: TenantTx,
    garageId: string,
    field: SuggestionField,
    value: string,
  ): Promise<void> {
    const display = value.trim().replace(/\s+/g, ' ');
    const normalized = normalizeSuggestion(value);
    if (!normalized) return;
    await tx.$executeRaw`
      INSERT INTO "suggestions" ("id", "garage_id", "field", "value", "value_normalized", "updated_at")
      VALUES (${uuidV7()}::uuid, ${garageId}::uuid, ${field}::"SuggestionField", ${display}, ${normalized}, now())
      ON CONFLICT ("garage_id", "field", "value_normalized") DO UPDATE
      SET "use_count" = "suggestions"."use_count" + 1, "last_used_at" = now(), "updated_at" = now()`;
  }
}
