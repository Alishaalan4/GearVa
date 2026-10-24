// The one list of tenant tables (database.md section 6.5).
// A migration that adds a tenant table adds it here and pastes the output of
// `npm run rls:sql -w @gearva/database -- <table>` into the same migration.
// test/rls.test.ts fails if this list and the database disagree.

/** The tenant root: its own `id` is the tenant id. */
export const TENANT_ROOT_TABLE = 'garages';

/** Every table with a `garage_id` column, in the order they were added. */
export const TENANT_TABLES = [
  // Phase 1
  'garage_settings',
  'branches',
  'users',
  'notifications',
  'audit_logs',
  // Phase 2
  'garage_customers',
  'vehicles',
  'service_types',
  'suggestions',
  'visits',
  'service_records',
  'reminders',
] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];

/**
 * Tenant tables whose rows with `garage_id IS NULL` are global defaults that every garage
 * may read (database.md 4.4, `service_types`). Writes stay limited to the garage's own
 * rows; global rows are managed by the platform role (admin, seed).
 */
export const GLOBAL_DEFAULT_TABLES: readonly TenantTable[] = ['service_types'];

const CURRENT_GARAGE = "NULLIF(current_setting('app.garage_id', true), '')::uuid";

/** RLS SQL for one tenant table (section 6.2). With no context set, it matches nothing. */
export function tenantPolicySql(table: string): string {
  const column = table === TENANT_ROOT_TABLE ? 'id' : 'garage_id';
  const lines = [
    `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`,
    `CREATE POLICY tenant_isolation ON "${table}"`,
    `  USING (${column} = ${CURRENT_GARAGE})`,
    `  WITH CHECK (${column} = ${CURRENT_GARAGE});`,
  ];
  if ((GLOBAL_DEFAULT_TABLES as readonly string[]).includes(table)) {
    // Permissive policies are OR-ed for SELECT only: global rows become readable, while
    // INSERT/UPDATE/DELETE still need tenant_isolation (the garage's own rows).
    lines.push(
      `CREATE POLICY global_defaults_read ON "${table}" FOR SELECT`,
      `  USING (garage_id IS NULL);`,
    );
  }
  return lines.join('\n');
}
