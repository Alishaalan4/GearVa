# Gearva — Progress log

One entry per step, newest at the bottom. Each entry has: time, summary, files changed, doc changes, how it was verified, and the commit.
Times are local (Asia/Beirut). Times marked `~` are approximate; commit times are exact.

## Status

| Phase | Step | Status | Finished |
|---|---|---|---|
| Docs | Review and first doc fixes | ✅ Done | 2026-10-19 ~09:56 |
| 0 | Skeleton | ✅ Done | 2026-10-19 10:37 |
| 1 | 1.1 Database base (roles, schema, RLS, guard-rail tests) | ✅ Done | 2026-10-19 11:02 |
| 1 | 1.2 API foundations | ✅ Done | 2026-10-19 14:38 |
| 1 | 1.3 Minimal notifications | ✅ Done | 2026-10-19 14:52 |
| 1 | 1.4 Admin auth (2FA) | ✅ Done | 2026-10-21 08:49 |
| 1 | 1.5a Admin garage management — API | ✅ Done | 2026-10-21 10:56 |
| 1 | 1.5b Admin garage management — admin web screens | ⏳ Next | |
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

## Phase 1 · Step 1.2 — API foundations
**When:** 2026-10-19 ~12:10 → 14:38 (~2 h 30 min, including three test-setup fixes)

**Implements:** README sections 5.1 (items 2–4), 5.4 (pagination), 5.6 (error shape, audit), rate limiting from section 2; database.md section 6.3.

**Summary:** The API now has everything later endpoints build on: it refuses to start with bad env vars; every request carries a tenant context (who, which garage, role, branch); garage code reaches tenant tables only through `TenantDb.run()`, which sets `app.garage_id` inside one transaction so RLS filters every query; errors always come back as `{ code, message, details }`; lists use one shared pagination schema (max 50); every successful mutating request writes an `audit_logs` row; requests are rate limited (120/min per IP, stored in Redis).

**Files changed**
| File | Change |
|---|---|
| `packages/contracts/src/errors.ts` | `ERROR_CODES` constants + `ApiErrorBody` type |
| `packages/contracts/src/pagination.ts` | `paginationQuerySchema` (Zod, max 50, default 20) + `Paginated<T>` |
| `packages/contracts/src/index.ts`, `package.json` | Export the above; add `zod` |
| `packages/database/src/tenant.ts` | `runAsTenant()`: one transaction, `set_config` first — the only place it is called |
| `packages/database/src/index.ts`, `src/client.ts` | Export `runAsTenant`, `TenantTx`; comment update |
| `apps/api/src/config/env.ts`, `env.module.ts` | Zod-validated env (`ENV` provider); reads root `.env` with `parseEnv` |
| `apps/api/src/common/context/request-context.ts` | `Actor` + `RequestContext` on nestjs-cls; `requireGarageId()` fails closed |
| `apps/api/src/common/db/*` | `TenantDb` (gearva_app + RLS), `PlatformDb` (gearva_platform), providers, `DatabaseModule` (raw clients not exported) |
| `apps/api/src/common/errors/*` | `AppException` + `AllExceptionsFilter` (error shape, no leaked internals) |
| `apps/api/src/common/pagination.ts` | `PaginationQueryDto`, `toSkipTake()`, `paginated()` |
| `apps/api/src/common/redis/redis.module.ts` | Shared Redis connection, closed on shutdown |
| `apps/api/src/audit/*` | `@Audit()` decorator, `AuditService`, global `AuditInterceptor` |
| `apps/api/src/app.module.ts` | Wires CLS, DB, Redis, throttler (Redis storage), Zod pipe, filter, guard |
| `apps/api/src/main.ts` | Port from env; `trust proxy` for Render |
| `apps/api/src/health/health.controller.ts` | `@SkipThrottle()` |
| `apps/api/test/foundations.spec.ts` | 7 HTTP tests: health, 404 shape, max page size, garage A/B isolation, fail-closed, audit row |
| `apps/api/package.json`, `tsconfig.spec.json` | New deps; Jest + ts-jest config; `test` runs Jest with `--experimental-vm-modules` |
| `README.md` | Getting started: `npx prisma migrate deploy` (rerun after a DB wipe) |

**Doc changes:** database.md 6.3 — the tenant wrapper is an explicit `runAsTenant()` transaction, not a `$allOperations` extension, because invoice numbering and payments need row locks held across several queries. README section 4 — migration command.

**Problems hit and fixed**
- Local DB had been recreated empty → applied the migration with `npx prisma migrate deploy`.
- Jest gives each test file its own `process.env`, so `process.loadEnvFile()` did not reach it → env is parsed with `parseEnv` and copied in.
- Prisma 7 loads its query engine with `import()`, which Jest only allows with `--experimental-vm-modules` → added the flag to the `test` script.

**Known shortcut:** API tests leave two `[test]` garages in the local DB (their audit rows are append-only). `npm run db:reset` clears them; step 1.7 moves tests to their own database.

**Verified:** `npm test` (7 database + 7 API tests passing), `npm run typecheck`, `npm run lint`, `npm run format`.
**Commit:** `05d76b9` — 2026-10-19 14:39

---

## Phase 1 · Step 1.3 — Minimal notifications
**When:** 2026-10-19 ~14:42 → 14:52 (~10 min)

**Implements:** README sections 5.5 (channel interface) and 5.6 (heavy work on BullMQ); flow.md 9.4 (pipeline, Phase 1 part); database.md 4.6 (`notifications`).

**Summary:** Every outgoing message now goes one way: `record()` writes a `QUEUED` row inside the caller's transaction (a repeated dedupe key never creates a second row), `dispatch()` adds a BullMQ job after commit (job id = notification id, so never queued twice), and the worker `deliver()`s it through the channel adapter and stores `SENT`, `FAILED` or `SKIPPED` with the reason. The only channel so far is EMAIL with a console adapter that prints the email. The first template is the staff invite in English and Arabic, which step 1.5 uses for the garage owner's invite. The worker runs inside the API and handles each job as a `SYSTEM` actor in that notification's garage, so it goes through RLS like everything else.

**Files changed**
| File | Change |
|---|---|
| `apps/api/src/notifications/notification-channel.ts` | `NotificationChannel` interface (README 5.5), `SendInput`, `SendResult`, channel list token |
| `apps/api/src/notifications/adapters/console-email.channel.ts` | EMAIL adapter for `EMAIL_ADAPTER=console` |
| `apps/api/src/notifications/templates/index.ts`, `staff-invite.ts` | Template registry + Zod-validated `staff-invite` (en/ar) |
| `apps/api/src/notifications/notifications.service.ts` | `record()`, `dispatch()`, `deliver()`; starts the worker on bootstrap |
| `apps/api/src/notifications/notifications.queue.ts` | BullMQ queue + worker on its own Redis connection |
| `apps/api/src/notifications/notifications.module.ts` | Registers channels, queue, service |
| `apps/api/src/app.module.ts` | Imports `NotificationsModule` |
| `apps/api/src/config/env.ts` | `EMAIL_ADAPTER` (console only for now), `EMAIL_FROM` |
| `apps/api/package.json` | `bullmq` |
| `apps/api/test/helpers/garages.ts` | Shared `createTestGarages()` + `waitFor()` |
| `apps/api/test/foundations.spec.ts` | Uses the shared helper |
| `apps/api/test/notifications.spec.ts` | 7 tests: SENT (en, ar), dedupe, same key in another garage, missing channel, missing recipient, bad template data |

**Doc changes:** README 5.5 — the log row is a `notifications` row (log and inbox are one table, database.md 4.6); `SendResult` shape written down.

**Notes:** Nest's testing logger prints errors only, so the invite emails do not appear in test output; they print in `npm run dev`. Test output was then made quiet: the fail-closed test now captures and asserts its own error log, and the API `test` script passes `--disable-warning=ExperimentalWarning` (`apps/api/test/foundations.spec.ts`, `apps/api/package.json`).

**Verified:** `npm test` — 7 database + 14 API tests passing (2 suites).
**Commit:** `c1f4bd5` — 2026-10-19 14:56

---

## Phase 1 · Step 1.4 — Admin auth (2FA)
**When:** 2026-10-21 ~07:30 → 08:49 (~1 h 20 min, including one test-ordering fix)

**Implements:** flow.md 2.3; README 5.2; database.md 4.1 (`admin_users`, `sessions`) and 9 (seed).

**Summary:** The platform owner can now sign in to the admin API. `npm run db:seed` creates the first super-admin. Login is password (argon2id) → a 5-minute 2FA challenge cookie → on the very first login a TOTP secret for any authenticator app (stored encrypted with AES-256-GCM) → a 6-digit code or a one-time recovery code → session. The first verified code turns 2FA on and returns 10 recovery codes once. Sessions are a 15-minute access JWT plus a 30-day refresh token that is stored only as a hash and replaced on every use; reusing an old one revokes all of that admin's sessions. `AdminGuard` protects `/admin/v1` and sets the ADMIN actor, so logins write `admin.login` audit rows with no garage. 10 failed attempts lock an email for 15 minutes, on top of a 10/min per-IP limit on the auth endpoints.

**Files changed**
| File | Change |
|---|---|
| `packages/contracts/src/auth.ts`, `index.ts` | Admin login + 2FA schemas and response types (shared with the admin web app) |
| `packages/contracts/src/errors.ts` | `INVALID_CREDENTIALS`, `INVALID_2FA_CODE` |
| `apps/api/src/auth/password.service.ts` | argon2id hash/verify; same timing for unknown users |
| `apps/api/src/auth/totp.service.ts` | TOTP secrets, codes, AES-256-GCM encryption, hashed one-time recovery codes |
| `apps/api/src/auth/session.service.ts` | Sessions, refresh rotation with reuse detection, access + 2FA-challenge JWTs |
| `apps/api/src/auth/cookies.ts`, `auth.module.ts` | Host-only, path-limited httpOnly cookies; JWT setup |
| `apps/api/src/admin/admin.guard.ts` | Protects `/admin/v1`; sets the ADMIN actor |
| `apps/api/src/admin/auth/admin-auth.controller.ts`, `admin-auth.service.ts` | `login`, `totp/setup`, `totp/verify`, `refresh`, `logout`, `me`; per-email lockout in Redis |
| `apps/api/src/admin/admin.module.ts`, `app.module.ts` | Wiring; throttler skipped when `NODE_ENV=test` |
| `apps/api/src/app.setup.ts`, `main.ts` | Shared app setup (trust proxy, cookie parser) used by main and tests |
| `apps/api/src/config/env.ts` | `JWT_ACCESS_SECRET` (32+ chars in production), `TOTP_ENCRYPTION_KEY` (must be 32 bytes) |
| `apps/api/package.json` | `@nestjs/jwt` 11 (12 is ESM-only), `argon2`, `otpauth`, `cookie-parser` |
| `packages/database/src/seed.ts`, `prisma.config.ts`, `package.json` | Seed for the first super-admin, compiled with the package; `argon2` |
| `package.json` (root) | `db:seed` script |
| `packages/database/turbo.json` | `test`/`typecheck` wait for this package's `build` (fixes a `prisma generate` race) |
| `apps/api/test/helpers/app.ts` | `createTestApp()` (same setup as main.ts) + `cookiesOf()` |
| `apps/api/test/admin-auth.spec.ts` | 10 tests: wrong password, unknown email, setup → verify → session, encrypted secret, audit row, guard, one-time recovery code, refresh reuse, logout |
| `apps/api/test/foundations.spec.ts`, `notifications.spec.ts` | Use `createTestApp()` |
| `.env.example` | Removed `JWT_REFRESH_SECRET`, `COOKIE_DOMAIN`; key-generation hint; empty secrets |

**Doc changes**
- README 5.2 — refresh tokens are random values stored hashed (so `JWT_REFRESH_SECRET` is gone); cookies are host-only and each web app forwards its API paths (`/admin/v1/*`, `/v1/*`) to the API, so no CORS and no `COOKIE_DOMAIN`.
- README 4 and 9 — env block and seed comment; custom domains no longer needed for cookies.
- flow.md 2.2 — cookie wording; flow.md 2.3 — exact admin login steps.
- database.md 9 — which seed item arrives in which step; seed is compiled, only creates missing rows.

**Problems hit and fixed:** `@gearva/database` build and test both ran `prisma generate` at the same time → test now waits for the package's own build.

**Known limit:** a TOTP code can be reused within its 30–90 s window (it still needs the password and is rate-limited). Close before launch.

**Verified:** `npm test` (7 database + 24 API tests), `npm run typecheck`, `npm run lint`, `npm run db:seed`; manual `POST /admin/v1/auth/login` → `{"next":"TOTP_SETUP"}` with the challenge cookie.
**Commit:** `7f9c1a1` — 2026-10-21 08:55

---

## Phase 1 · Step 1.5a — Admin garage management (API)
**When:** 2026-10-21 ~09:00 → 10:56 (~2 h, including one type fix)

**Implements:** flow.md 2.1 (admin creates a garage) and the suspend/reactivate part of 11.1; database.md 4.2.

**Summary:** Step 1.5 is split in two: this is the API, 1.5b is the admin screens. An admin can now create a garage (trial for 30 days, or paid until a chosen day): one transaction creates the garage, its default settings, the main branch `BR1` and the OWNER account without a password, and queues the invite email, which is sent after commit. Admins can list garages (search, status filter, pagination), open one (owner status, link expiry, branches), resend the invite (only before the owner has a password), send a 24-hour password reset (only after), suspend with a reason and reactivate. Set-password links carry a random token; only its SHA-256 is stored. Every mutation writes an audit row that records the garage.

**Files changed**
| File | Change |
|---|---|
| `packages/contracts/src/garages.ts`, `index.ts` | Create (trial \| paid), list query, suspend schemas; list/detail response types; `TRIAL_DAYS` |
| `packages/contracts/src/errors.ts` | `EMAIL_ALREADY_USED`, `OWNER_ALREADY_ACTIVE`, `OWNER_NOT_ACTIVATED`, `GARAGE_ALREADY_SUSPENDED`, `GARAGE_NOT_SUSPENDED` |
| `apps/api/src/admin/garages/admin-garages.service.ts` | Create, list, detail, resend invite, password reset, suspend, reactivate |
| `apps/api/src/admin/garages/admin-garages.controller.ts` | `/admin/v1/garages` endpoints behind `AdminGuard`; create body validated with the schema directly (union) |
| `apps/api/src/admin/admin.module.ts` | Registers the garages controller/service; imports notifications |
| `apps/api/src/auth/access-links.ts` | One-time set-password links (invite 7 days, reset 24 hours), hashed tokens |
| `apps/api/src/notifications/templates/password-reset.ts`, `index.ts` | Reset email (en/ar) |
| `apps/api/src/audit/audit.interceptor.ts` | Admin audit rows record the garage (`:garageId` param or the created garage) |
| `apps/api/src/config/env.ts` | `APP_URL_GARAGE` (base of the links) |
| `apps/api/test/helpers/admin.ts` | `signInAsNewAdmin()` through the real login endpoints |
| `apps/api/test/admin-garages.spec.ts` | 9 tests: auth required, trial create (rows, invite link = stored hash, audit), paid create, bad dates, duplicate email with no partial rows, list/search/filter/page size, 404, invite vs reset rules, suspend/reactivate + audit |

**Doc changes**
- flow.md 2.1 — details: owner email = garage email, trial/paid dates, main branch name, link lifetimes and rules, endpoint list.
- database.md 4.6 — invite/reset dedupe keys; **`notifications.payload` holds the one-time link, so no screen may show `payload`**.

**Problems hit and fixed:** a class cannot extend the trial-or-paid union type → that body is validated with `ZodValidationPipe(createGarageSchema)` directly.

**Not in this step:** the lock guard that actually blocks a suspended garage (step 1.6); `trial.days` and subscription payments (Phase 5).

**Verified:** `npm test` (7 database + 33 API tests), API typecheck and lint.
**Commit:** pending — `Phase 1.5a: admin garage management API`

---
