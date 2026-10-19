// Prints the RLS SQL for the given tables, or for every tenant table when none are given.
// Usage: npm run rls:sql -w @gearva/database -- branches users
import { TENANT_ROOT_TABLE, TENANT_TABLES, tenantPolicySql } from '../tenant-tables';

const requested = process.argv.slice(2);
const known: string[] = [TENANT_ROOT_TABLE, ...TENANT_TABLES];
const tables = requested.length > 0 ? requested : known;

for (const table of tables) {
  if (!known.includes(table)) {
    console.error(`"${table}" is not in tenant-tables.ts. Add it there first.`);
    process.exit(1);
  }
  console.log(`-- RLS: ${table}\n${tenantPolicySql(table)}\n`);
}
