# Gearva — Progress log

One entry per step, newest at the bottom. Each entry has: time, summary, files changed, doc changes, how it was verified, and the commit.
Times are local (Asia/Beirut). Times marked `~` are approximate; commit times are exact.

## Status

| Phase | Step | Status | Finished |
|---|---|---|---|
| Docs | Review and first doc fixes | ✅ Done | 2026-10-19 ~09:56 |
| 0 | Skeleton | ✅ Done | 2026-10-19 10:37 |
| 1 | 1.1 Database base (roles, schema, RLS, guard-rail tests) | ✅ Done | 2026-10-19 11:02 |
| 1 | 1.2 API foundations | ⏳ Next | |
| 1 | 1.3 Minimal notifications | | |
| 1 | 1.4 Admin auth (2FA) | | |
| 1 | 1.5 Admin garage management | | |
| 1 | 1.6 Staff side (login, roles, branches, lock) | | |
| 1 | 1.7 Tenancy suite and CI | | |

---

## Docs review and first doc fixes
**When:** 2026-10-19 ~09:35 → ~09:56 (~20 min)

**Summary:** Read README, flow.md and database.md. Found 11 inconsistencies. Fixed the ones Phase 0 and Phase 1 need; items 8–11 (invoices in Phase 2, "one payment per visit", line-total rounding, wrong section number) wait for Phase 2/3.

**Files changed**
| File | Change |
|---|---|
| `docs/README.md` (later moved to `README.md`) | Pinned TypeScript 5.9, NestJS 11, ESLint 9 with reasons; docs folder in structure; `CLAUDE.md`; `format` scripts; note that `db:seed`/`test:tenancy` come in Phase 1; new env vars `TOTP_ENCRYPTION_KEY`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` |
| `docs/database.md` | `audit_logs.garageId` nullable for admin/system actions; forward-reference rule (FK added in the later phase); roles created by a bootstrap script, not a migration |
| `docs/flow.md` | Non-trial garage needs a paid-until date; lock guard also blocks `EXPIRED`; `ACTIVE` always has `expiresAt` |

**Verified:** review only.
**Commit:** included in Phase 0 commit `55fc0c9`.

---

## Phase 0 — Skeleton
**When:** 2026-10-19 ~09:56 → 10:37 (~40 min)

**Summary:** npm workspaces + Turborepo monorepo with the three apps and three packages. API answers `GET /health`; both Next.js apps start; Postgres + Redis run in Docker. Done-when met: `npm run dev` starts all apps, `/health` works, lint and typecheck pass.

**Files changed**
| File | Change |
|---|---|
| `package.json`, `package-lock.json` | Root workspace, scripts (`dev`, `build`, `lint`, `typecheck`, `test`, `format`, `db:*`) |
| `turbo.json` | Task graph (build, dev, lint, typecheck, test) |
| `.gitignore`, `.prettierignore` | Ignore build output, env files, generated Prisma client |
| `docker-compose.yml` | Postgres 17 + Redis 8 for local dev |
| `.env.example` | All env vars from README section 4 |
| `packages/config/*` | Shared tsconfig (base, library, nestjs, nextjs), ESLint flat configs (base, next), Prettier config |
| `packages/contracts/*` | Compiled package; `HealthResponse` type |
| `packages/database/*` | Prisma 7 config (`prisma.config.ts`), empty schema |
| `apps/api/*` | NestJS 11 app, `HealthModule` with `GET /health` |
| `apps/garage-web/*`, `apps/admin/*` | Next.js 16 + Tailwind 4 placeholder apps on ports 3000 / 3001 |
| `README.md`, `CLAUDE.md` | Moved to repo root / renamed |

**Verified:** `npm run dev`, `http://localhost:4000/health`, `npm run lint`, `npm run typecheck`.
**Commit:** `55fc0c9` — 2026-10-19 10:37

---

## Phase 1 · Step 1.1 — Database base
**When:** 2026-10-19 ~10:45 → 11:02 (~20 min)

**Implements:** database.md sections 1, 4.1, 4.2, 4.6, 5, 6.1, 6.2, 6.5, 7, 10; flow.md 2.6.

**Summary:** The three DB roles are created automatically by Docker; the first migration creates the 8 Phase 1 tables with grants, RLS on every tenant table and a one-owner-per-garage index. A guard-rail test proves RLS covers every tenant table and that garage A cannot read, write, update or delete garage B rows, and that audit rows cannot be changed.

**Files changed**
| File | Change |
|---|---|
| `.gitattributes` | Keep `.sh` files with LF endings (needed by the Linux container) |
| `docker-compose.yml` | Role passwords; mounts the bootstrap script into Postgres init |
| `turbo.json` | Pass DB/Redis URLs through to tasks |
| `packages/database/sql/bootstrap-roles.sql` | Creates `gearva_migrator`, `gearva_app` (NOBYPASSRLS), `gearva_platform` (BYPASSRLS); migrator owns `public` |
| `packages/database/sql/docker-init.sh` | Runs the bootstrap locally; gives migrator CREATEDB for the shadow DB |
| `packages/database/prisma/schema.prisma` | Enums + `AdminUser`, `Session`, `Garage`, `GarageSettings`, `Branch`, `User`, `Notification`, `AuditLog` |
| `packages/database/prisma/migrations/20261019075747_phase1_init/migration.sql` | Generated tables + hand-written: one-owner index, grants per table, RLS policies; audit FK set to RESTRICT |
| `packages/database/src/tenant-tables.ts` | The single list of tenant tables + policy SQL generator |
| `packages/database/src/scripts/print-rls-sql.ts` | `npm run rls:sql` prints policy SQL |
| `packages/database/src/client.ts`, `src/index.ts` | `createPrismaClient()` with `@prisma/adapter-pg`; package exports |
| `packages/database/test/rls.test.ts`, `test/setup.ts`, `vitest.config.mts` | RLS guard-rail tests (7) against real Postgres |
| `packages/database/package.json`, `tsconfig.json`, `tsconfig.build.json` | Build/generate/test scripts; Prisma client, adapter, Vitest deps |

**Doc changes (database.md):** `invoiceEditWindow` moves to Phase 3; missing `garage_settings` defaults written down; `audit_logs` has `createdAt` only; grants per table by name with no default privileges; platform tables granted to `gearva_platform` only; `U(inviteTokenHash)` and one-OWNER index in section 7; `tenant-tables.ts` path; PowerShell-safe migration command in section 10.

**Verified:** `npx prisma migrate dev`, `npm test` in `packages/database` (7 passing), `npm run lint`, `npm run typecheck`.
**Commit:** `1b44307` — 2026-10-19 11:02

---
