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
] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];

const CURRENT_GARAGE = "NULLIF(current_setting('app.garage_id', true), '')::uuid";

/** RLS SQL for one tenant table (section 6.2). With no context set, it matches nothing. */
export function tenantPolicySql(table: string): string {
  const column = table === TENANT_ROOT_TABLE ? 'id' : 'garage_id';
  return [
    `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`,
    `CREATE POLICY tenant_isolation ON "${table}"`,
    `  USING (${column} = ${CURRENT_GARAGE})`,
    `  WITH CHECK (${column} = ${CURRENT_GARAGE});`,
  ].join('\n');
}
