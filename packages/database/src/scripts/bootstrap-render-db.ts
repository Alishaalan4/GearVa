// npm run bootstrap:render -w @gearva/database -- "<Render external database URL>"
//
// One-time setup of a Render Postgres database (database.md 6.1, README 9), run from your
// own computer. Render's free plan has no shell, and the three roles cannot be made by a
// migration, so this does what bootstrap-roles.sql does for Docker:
//   1. creates gearva_migrator, gearva_app and gearva_platform with new random passwords
//      (run again, it gives the existing roles new passwords);
//   2. makes gearva_migrator the owner of the `public` schema, and lets the app roles in;
//   3. prints the three connection URLs for the API, with Render's internal host name.
// BYPASSRLS is asked for but not needed: the platform_access policies cover its absence.
import { randomBytes } from 'node:crypto';
import { createPrismaClient } from '../client';

type Db = ReturnType<typeof createPrismaClient>;

async function tryRun(db: Db, sql: string): Promise<string | null> {
  try {
    await db.$executeRawUnsafe(sql);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message.split('\n').at(-1)!.trim() : String(error);
  }
}

async function upsertRole(db: Db, name: string, attributes: string, password: string) {
  const [row] = await db.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists`,
    name,
  );
  // Passwords are hex, so they are safe inside the quotes.
  const verb = row?.exists ? 'ALTER' : 'CREATE';
  const failed = await tryRun(db, `${verb} ROLE ${name} ${attributes} PASSWORD '${password}'`);
  if (failed) throw new Error(`${verb} ROLE ${name} failed: ${failed}`);
  console.log(`${verb === 'CREATE' ? 'Created' : 'Updated'} role ${name}.`);
}

async function main(): Promise<void> {
  const given = process.argv[2];
  if (!given) {
    throw new Error(
      "Pass the database's External Database URL from the Render dashboard:\n" +
        '  npm run bootstrap:render -w @gearva/database -- "postgresql://..."',
    );
  }
  const url = new URL(given);
  if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require');
  const database = decodeURIComponent(url.pathname.slice(1));

  const passwords = {
    migrator: randomBytes(24).toString('hex'),
    app: randomBytes(24).toString('hex'),
    platform: randomBytes(24).toString('hex'),
  };
  const db = createPrismaClient(url.toString());
  try {
    const [me] = await db.$queryRawUnsafe<
      { name: string; superuser: boolean; createrole: boolean; bypassrls: boolean }[]
    >(
      `SELECT rolname AS name, rolsuper AS superuser, rolcreaterole AS createrole,
              rolbypassrls AS bypassrls
       FROM pg_roles WHERE rolname = current_user`,
    );
    console.log(
      `Connected to "${database}" as ${me!.name} (superuser: ${me!.superuser}, ` +
        `createrole: ${me!.createrole}, bypassrls: ${me!.bypassrls}).`,
    );
    if (!me!.superuser && !me!.createrole) {
      throw new Error(
        'This user may not create roles, so nothing was changed. Send this output to Claude: ' +
          'the role design needs the one-user fallback (database.md 6.1).',
      );
    }

    await upsertRole(db, 'gearva_migrator', 'LOGIN NOSUPERUSER', passwords.migrator);
    await upsertRole(db, 'gearva_app', 'LOGIN NOSUPERUSER NOBYPASSRLS', passwords.app);
    try {
      await upsertRole(db, 'gearva_platform', 'LOGIN NOSUPERUSER BYPASSRLS', passwords.platform);
    } catch {
      await upsertRole(db, 'gearva_platform', 'LOGIN NOSUPERUSER', passwords.platform);
      console.log(
        '  (without BYPASSRLS, which this host refuses: the platform_access policies apply)',
      );
    }

    for (const role of ['gearva_migrator', 'gearva_app', 'gearva_platform']) {
      await tryRun(db, `GRANT CONNECT ON DATABASE "${database}" TO ${role}`);
    }
    // Postgres 16+: changing an owner needs membership of the new owner role.
    await tryRun(db, 'GRANT gearva_migrator TO current_user');
    const ownerFailed = await tryRun(db, 'ALTER SCHEMA public OWNER TO gearva_migrator');
    if (ownerFailed) {
      const grantFailed = await tryRun(
        db,
        'GRANT USAGE, CREATE ON SCHEMA public TO gearva_migrator',
      );
      if (grantFailed) throw new Error(`gearva_migrator cannot create tables: ${grantFailed}`);
      console.log(
        `The schema stays with ${me!.name} (${ownerFailed}); gearva_migrator may create in it.`,
      );
    } else {
      console.log('gearva_migrator now owns the public schema.');
    }
    const usageFailed = await tryRun(
      db,
      'GRANT USAGE ON SCHEMA public TO gearva_app, gearva_platform',
    );
    if (usageFailed) throw new Error(`GRANT USAGE failed: ${usageFailed}`);
  } finally {
    await db.$disconnect();
  }

  // Render's internal host is the first part of the external one (dpg-xxxx-a).
  const host = url.hostname.endsWith('.render.com') ? url.hostname.split('.')[0]! : url.hostname;
  const port = url.port || '5432';
  const at = (user: string, password: string) =>
    `postgresql://${user}:${password}@${host}:${port}/${encodeURIComponent(database)}`;
  console.log('\nDone. Paste these three into the gearva-api service on Render (Environment):\n');
  console.log(`DATABASE_URL=${at('gearva_app', passwords.app)}`);
  console.log(`MIGRATION_DATABASE_URL=${at('gearva_migrator', passwords.migrator)}`);
  console.log(`PLATFORM_DATABASE_URL=${at('gearva_platform', passwords.platform)}`);
  console.log('\nThey are shown only now. Running this again makes new passwords.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
