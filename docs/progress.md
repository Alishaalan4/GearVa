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
| 1 | 1.5b Admin garage management — admin web screens (+ optional 2FA) | ✅ Done | 2026-10-21 11:43 |
| 1 | 1.6a Staff side — API (login, roles, branches, staff, lock) | ✅ Done | 2026-10-21 12:31 |
| 1 | 1.6b Staff side — garage-web screens | ✅ Done | 2026-10-22 ~12:30 |
| 1 | 1.7 Tenancy suite and CI | ✅ Done | 2026-10-23 |
| 1 | 1.8 Review fixes (guard, phones, branch rule, CI) | ✅ Done | 2026-10-23 |
| 2 | 2.0 Doc fixes before Phase 2 | ✅ Done | 2026-10-23 |
| 2 | 2.1 Database: customers, vehicles, services, visits, reminders | ✅ Done | 2026-10-24 |
| 2 | 2.2 Calculations (km/mi, plates, daily km, next due) | ✅ Done | 2026-10-26 |
| 2 | 2.3 API: customers, vehicles, search, suggestions | ✅ Done | 2026-10-26 |
| 2 | 2.4 API: quick entry, visits, history | ✅ Done | 2026-10-26 |
| 2 | 2.5 garage-web: search, customers, cars | ✅ Done | 2026-10-29 |
| 2 | 2.6 garage-web: quick entry, history timeline (Done-when check) | ✅ Done | 2026-11-01 |
| Design | D.1 Colours, dark mode, fonts, shared components, sidebar | ✅ Done | 2026-11-02 |
| Design | D.2 Page layouts (login, tables, status pills) | ✅ Done | 2026-11-02 |
| 3 | 3.0 Doc fixes and Phase 3 decisions | ✅ Done | 2026-11-02 |
| 3 | 3.1 Database: invoices, payments, offers, files | ✅ Done | 2026-11-02 |
| 3 | 3.2 Calculations (totals, discount, VAT, invoice number) | ✅ Done | 2026-11-02 |
| 3 | 3.3 API: finish creates the invoice, payments, free work | ✅ Done | 2026-11-02 |
| 3 | 3.4 API: edit, cancel, debt list, income summary, invoice settings | ✅ Done | 2026-11-02 |
| 3 | 3.5 PDF (Arabic + English) and file storage | ✅ Done | 2026-11-02 |
| 3 | 3.6 garage-web: finish step, invoice page, payments | ✅ Done | 2026-11-02 |
| 3 | 3.7 garage-web: debt list, income summary, settings (Done-when check) | ✅ Done | 2026-11-03 |
| 3 | 3.8 Fix: first PDF froze the API; deployment moved after Phase 5 | ✅ Done | 2026-11-05 |
| 4 | 4.0 Doc fixes and Phase 4 decisions (email, WhatsApp list, monthly off) | ✅ Done | 2026-11-05 |
| 4 | 4.1 Database: customer email, monthly reminder setting | ✅ Done | 2026-11-05 |
| 4 | 4.2 Pipeline: retries, daytime delay, stuck rows, fair-use cap | ✅ Done | 2026-11-05 |
| 4 | 4.3 Reminder scan job (due rule, rounds, follow-ups, warranty, monthly) | ✅ Done | 2026-11-05 |
| 4 | 4.4 API: customer email, reminders due + mark sent, notification log, reminder settings | ✅ Done | 2026-11-09 |
| 4 | 4.5 garage-web: email field, Reminders due (WhatsApp), log, settings (Done-when check) | ✅ Done | 2026-11-09 |
| 5 | 5.0 Doc fixes and Phase 5 decisions (website in garage-web, prices, simple counts) | ✅ Done | 2026-11-09 |
| 5 | 5.1 Database: subscription payments, access logs, system settings, applications | ✅ Done | 2026-11-09 |
| 5 | 5.2 API: subscription lifecycle (payments, trial extension, daily expiry job) | ✅ Done | 2026-11-09 |
| 5 | 5.3 API: system settings (constants move here) and global service types | ✅ Done | 2026-11-09 |
| 5 | 5.4 API: monitoring lists, usage counts, business view | ✅ Done | 2026-11-09 |
| 5 | 5.5 API: view as garage (read-only, access log) | ✅ Done | 2026-11-09 |
| 5 | 5.6 Applications API and the public website pages in garage-web | ✅ Done | 2026-11-10 |
| 5 | 5.7 admin web screens (Done-when check) | ✅ Done | 2026-11-10 |
| Deploy | D.1 Code ready for hosting: Blueprint, Resend and R2 adapters, visitor IPs, headers, Render DB setup | ✅ Done | 2026-11-11 |
| Deploy | D.2 The user creates the accounts and services (docs/deploy.md), then the live checks | Next | |

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
**Commit:** `8098e8c` — 2026-10-21 10:57

---

## Phase 1 · Step 1.5b — Admin web screens (+ 2FA made optional)
**When:** 2026-10-21 ~11:00 → 11:43 (~45 min, including the 2FA change and three setup fixes)

**Implements:** flow.md 2.1 and 2.3 (admin side); README 5.2 (API forwarding), 5.7 (TanStack Query, react-hook-form + the API's Zod schemas, next-intl, logical Tailwind classes).

**Summary:** The admin panel at `localhost:3001` is now usable, in English and Arabic (right-to-left). An admin signs in, sees the garage list (search, status filter, pages), creates a garage (trial or paid) and opens it to resend the invite, send a password reset, suspend with a reason or reactivate. The app forwards `/admin/v1/*` to the API, so session cookies belong to the admin site; an expired 15-minute session is refreshed once automatically.

**Decision (user, 2026-10-21): admin 2FA is optional, not mandatory.** With 2FA off the password signs in directly. Any admin can turn it on from the new **Account** page (QR code or typed key → one code → 10 recovery codes shown once) and off again (needs a current or recovery code). With 2FA on, login asks for the code or a recovery code. The docs still recommend it for every admin.

**Files changed**
| File | Change |
|---|---|
| `apps/admin/package.json` | `next-intl`, `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers` 5.9 (6.0 has conflicting optional peers), `qrcode.react`, `zod`, `@gearva/contracts` |
| `apps/admin/next.config.ts` | next-intl plugin; forwards `/admin/v1/*` to `API_URL` |
| `apps/admin/proxy.ts`, `i18n/*` | `/en` and `/ar` routing (Next 16 proxy), locale-aware navigation, dates shown in UTC |
| `apps/admin/messages/en.json`, `ar.json` | Every visible string |
| `apps/admin/lib/api.ts` | Fetch wrapper: error shape → `ApiError`, one automatic session refresh |
| `apps/admin/components/*` | Providers, small Tailwind UI pieces, translated error alert, language toggle, signed-in shell with header |
| `apps/admin/features/auth/*` | Login, code / recovery-code step, recovery codes, `useAdmin` |
| `apps/admin/features/account/*` | Account page with turning 2FA on/off |
| `apps/admin/features/garages/*` | List, new-garage form, detail page, status badge |
| `apps/admin/app/[locale]/**` | Pages: login, login/verify, garages, garages/new, garages/[garageId], account (Phase 0 `app/layout.tsx`, `app/page.tsx` removed) |
| `apps/admin/postcss.config.mjs`, `apps/garage-web/postcss.config.mjs` | Named export (lint warning) |
| `packages/contracts/src/auth.ts`, `errors.ts` | Login answer `DONE` \| `TOTP_VERIFY`; enable schema; `totpEnabled` on the profile; `TOTP_*` error codes |
| `apps/api/src/admin/auth/admin-auth.service.ts`, `admin-auth.controller.ts` | Password-only login when 2FA is off; signed-in `totp/setup`, `totp/enable`, `totp/disable` |
| `apps/api/src/admin/admin.guard.ts` | No longer requires 2FA |
| `apps/api/test/admin-auth.spec.ts` | Rewritten for the new flow (11 tests) |
| `packages/database/src/seed.ts` | Seed message |
| `turbo.json` | `API_URL` passed through to tasks |

**Doc changes**
- README 1 (admin is Arabic/English, optional 2FA), 2 (auth row), 5.2, Phase 1 roadmap line.
- flow.md 1 (actors) and 2.3 rewritten: optional 2FA with the decision date, the new endpoints.
- database.md `admin_users.totpEnabled` and seed note.

**Problems hit and fixed:** `@hookform/resolvers` 6.0 peer conflict → 5.9.2; stale `apps/admin/.next` route types from before the `[locale]` move → cache deleted (safe, regenerated); two lint warnings (`useWatch`, named PostCSS export).

**Verified:** `npm test` (7 database + 34 API tests), `npm run typecheck`, `npm run lint` (0 warnings); manual check in the browser: login, create garage, invite email in the console, resend invite, suspend/reactivate, list search/filter, Arabic layout.
**Commit:** `a148ceb` — `Phase 1.5b: admin web screens, optional admin 2FA`

---

## Phase 1 · Step 1.6a — Staff side API (login, lock, branches, staff)
**When:** 2026-10-21 ~11:50 → 12:31 (~40 min)

**Implements:** flow.md 1 (permission matrix for branches/staff), 2.2 (staff invite, set password, login), 2.5 (subscription lock); README 5.1 (tenant isolation), 5.2 (sessions, cookies).

**Summary:** Garage staff can now use the API. An invited person opens the link, sets a password (10+ characters, link works once, other sessions end) and is signed in. Staff log in, refresh and log out with `gv_at` / `gv_rt` cookies; there is no staff 2FA. A global `StaffGuard` protects every `/v1/*` route (session → garage lock → `@Roles` → tenant context); only set-password, login, refresh and logout are `@Public()`. A garage that is suspended, expired or whose trial ended gets `403 GARAGE_LOCKED` with `details.reason`, mid-session and at login, and nothing is deleted: after reactivation the same session works again. The owner manages branches (automatic codes `BR2`, `BR3`…; the main branch can't be deactivated) and staff (invite with role and branch, edit, deactivate = signed out at once, resend invite, password reset; the owner account can't be changed here). Managers can list branches. The per-email login lockout and invite/reset links are now shared services used by admin and staff. The dev seed creates a Demo Garage with an owner login.

**Files changed**
| File | Change |
|---|---|
| `packages/contracts/src/staff.ts` (new), `errors.ts`, `index.ts` | Staff/branch schemas and types; `GARAGE_LOCKED`, `INVALID_LINK`, `USER_ALREADY_ACTIVE`, `USER_NOT_ACTIVATED`, `CANNOT_MODIFY_OWNER`, `MAIN_BRANCH_REQUIRED` |
| `apps/api/src/common/garage-lock.ts` (new) | The flow.md 2.5 lock rule as one function |
| `apps/api/src/auth/staff.guard.ts`, `staff-access.decorators.ts` (new) | Global guard, `@Public()`, `@Roles()` |
| `apps/api/src/auth/staff-auth.service.ts`, `staff-auth.controller.ts` (new) | `/v1/auth/set-password`, `login`, `refresh`, `logout`, `me` |
| `apps/api/src/auth/login-attempts.service.ts`, `user-access-links.service.ts` (new) | Shared lockout and invite/reset links |
| `apps/api/src/auth/session.service.ts` | `rotate()` takes a check that runs before the token is replaced (a lock no longer ends the session) |
| `apps/api/src/auth/cookies.ts`, `auth.module.ts`, `app.module.ts`, `admin/*` | Staff cookies; global `StaffGuard`; admin code uses the shared services |
| `apps/api/src/branches/*`, `apps/api/src/users/*` (new) | Branch and staff endpoints |
| `apps/api/test/staff-auth.spec.ts`, `staff-management.spec.ts`, `garage-lock.spec.ts`, `helpers/staff.ts` (new) | 22 new tests incl. the Phase 1 story end to end and isolation |
| `apps/api/package.json` | Jest `testTimeout` 30 s |
| `packages/database/src/seed.ts` | Demo Garage (BR1, BR2) with owner login, development only |
| `.env.example` | `SEED_DEMO_OWNER_EMAIL`, `SEED_DEMO_OWNER_PASSWORD` |
| `apps/admin/**`, `apps/api/test/admin-auth.spec.ts` | Formatting only (`npm run format`) |

**Doc changes**
- flow.md 2.2: set-password rules, staff endpoints, no staff 2FA, lockout.
- flow.md 2.5: `trial_ended` reason, global guard, a lock deletes nothing.
- database.md 9: Demo Garage seed.
- README 4: `SEED_DEMO_OWNER_*`.

**Problems hit and fixed:** first full run timed out in every app suite's `beforeAll` (7 apps booting at once with a cold ts-jest cache took over Jest's 5 s default) → `testTimeout` 30 s. One real bug: a refresh while locked replaced and then revoked the session, so the user was signed out after reactivation (against flow.md 2.5) → the lock is checked before rotating.

**Verified:** `npm test` (7 database + 56 API tests in 7 suites), `npm run typecheck`, `npm run lint`, `npm run format`, `npm run db:seed` (Demo Garage created) — run by the user.
**Commit:** `63a6412` — `Phase 1.6a: staff auth, garage lock, branches and staff API`

---

## Phase 1 · Step 1.6b — Garage web screens (staff side)
**When:** 2026-10-21 ~12:40 → 2026-10-22 ~12:30 (about 1 h of work; verification finished the next day)

**Implements:** flow.md 1 (owner-only staff and branch settings), 2.1 step 4 and 2.2 (set password, login), 2.5 (lock screen); README 5.2 (API forwarding), 5.7 (TanStack Query, react-hook-form + the API's Zod schemas, next-intl, logical Tailwind classes).

**Summary:** The garage app at `localhost:3000` is usable. Staff sign in; an invited person opens the email link, sets a password (typed twice) and is signed in; a used or expired link says so. Any `GARAGE_LOCKED` answer replaces the app with a lock screen for the reason (suspended, expired, trial ended) with "Try again" and "Sign out". The owner manages branches (add, edit, deactivate; not the main branch) and staff (invite with role, branch and email language, edit, resend invite, password reset, deactivate with confirmation). Other roles see a welcome page until Phase 2. The app forwards `/v1/*` to the API and refreshes an expired session once.

**Decision (user, 2026-10-21): English is the default language, not Arabic.** The browser's language is ignored. Choosing Arabic with the language switch is remembered on that device for a year (cookie `gv_locale`), so links without `/en` or `/ar` (invite emails, bookmarks) open in the chosen language.

**Files changed**
| File | Change |
|---|---|
| `apps/garage-web/package.json`, `next.config.ts` | `next-intl`, TanStack Query, react-hook-form, `@hookform/resolvers` 5.9, `zod`, `@gearva/contracts`, `@gearva/ui`; forwards `/v1/*` to `API_URL` |
| `apps/garage-web/proxy.ts`, `i18n/*` | `/en` and `/ar` routing, English default, remembered choice, Asia/Beirut time zone |
| `apps/garage-web/messages/en.json`, `ar.json` | Every visible string |
| `apps/garage-web/lib/api.ts` | Fetch wrapper, one refresh, `GARAGE_LOCKED` from a refused refresh passed on (lock screen, not login) |
| `apps/garage-web/components/*` | Providers (lock screen on any `GARAGE_LOCKED`), app shell, owner-only guard, error alert, language switch |
| `apps/garage-web/features/auth/*` | Login, set password, lock screen, `useStaff` |
| `apps/garage-web/features/branches/*`, `features/staff/*`, `features/home/*` | Branch settings, staff settings, home page |
| `apps/garage-web/app/[locale]/**` | Pages: login, set-password, home, settings/branches, settings/staff (Phase 0 `app/layout.tsx`, `app/page.tsx` removed) |
| `packages/ui/*` (new) | `Button`, `Input`, `Select`, `Textarea`, `Field`, `Card`, `Alert` moved from `apps/admin/components/ui.tsx`; shipped as source |
| `apps/admin/**` | Imports `@gearva/ui`; `transpilePackages`; Tailwind `@source` for the shared package |
| `apps/api/src/auth/staff-auth.controller.ts` | A refresh refused with `GARAGE_LOCKED` no longer clears the cookies |
| `apps/api/test/staff-auth.spec.ts` | Locked refresh keeps cookies; the same refresh token works after reactivation |

**Doc changes**
- README 3: `packages/ui` in the structure; the rule now says when it was created and what may go in it.
- flow.md 2.2: garage web app (English default and remembered choice, pages, no self-service password reset, lock screen).
- flow.md 2.5: a locked refresh keeps the session cookies.

**Problems hit and fixed:** one real bug found while building the lock screen: `/v1/auth/refresh` cleared the cookies when the garage was locked, so staff were signed out ~15 minutes into a lock, against flow.md 2.5 ("sessions stay valid") → cookies are kept on `GARAGE_LOCKED`. README 3 required `packages/ui` once a component was copied between the apps → created it instead of copying `ui.tsx`.

**Verified:** `npm run format`, `npm run typecheck`, `npm run lint`, `npm test` (7 database + 56 API tests) — run by the user. Manual browser check by the user: language default and remembered choice, login, branches, staff invite → set password from the console email → mechanic has no settings, link reuse refused, deactivation signs out, suspend → lock screen → reactivate → "Try again".
**Commit:** `f9335ac` — `Phase 1.6b: garage-web screens, packages/ui, keep cookies on locked refresh`

---

## Phase 1 · Step 1.7 — Own test database, tenancy suite, CI
**When:** 2026-10-23 (~45 min)

**Implements:** README 5.1.6 (`test:tenancy` proves isolation through every endpoint), README 8 (tests on a real Postgres, mandatory `test:tenancy` in CI). Completes Phase 1's "Done when" once the first CI run is green.

**Summary:** Tests now run on their own database. `npm test` and `npm run test:tenancy` first drop and recreate `gearva_test` with every migration applied; the test setup points the three connection URLs at it and Redis at database 1, so development data is never touched and a running `npm run dev` never picks up test jobs. `npm run test:tenancy` runs the RLS guard rails and a new endpoint suite: two garages, and for every `/v1` endpoint garage A's owner tries to read, change or use garage B's branches and staff and must fail while B's rows stay identical (also a `garageId` sent in the body is ignored). The suite lists every `/v1` route the API really serves (from Nest's metadata) and fails when one has no isolation case or stated reason, so a new endpoint cannot ship without one. GitHub Actions runs lint, typecheck, test and test:tenancy on every push to `main` and every pull request.

**Files changed**
| File | Change |
|---|---|
| `packages/database/src/test-environment.ts` (new), `package.json` | `toTestDatabaseUrl`, `useTestEnvironment` (subpath export `@gearva/database/test-environment`); scripts `test:prepare`, `test:tenancy` |
| `packages/database/src/scripts/prepare-test-db.ts` (new) | Drops/creates `<name>_test` as the migrator, grants schema usage, runs `prisma migrate deploy` on it; refuses any name not ending in `_test` |
| `packages/database/test/setup.ts`, `turbo.json` | Vitest uses the test database; `test:tenancy` task |
| `apps/api/test/setup.ts` (new), `apps/api/package.json` | Jest `setupFiles` switches to the test database; `test:tenancy` script |
| `apps/api/test/tenancy.spec.ts` (new) | 9 endpoint cases + the route-coverage check |
| `apps/api/test/staff-management.spec.ts`, `helpers/garages.ts` | Isolation tests moved to the tenancy suite; comment |
| `package.json`, `turbo.json` | Root `test` and `test:tenancy` prepare the test database first; `test:tenancy` task |
| `.github/workflows/ci.yml` (new) | Postgres 17 + Redis 8 services, roles from `bootstrap-roles.sql` + `CREATEDB`, `.env` from `.env.example` with a random TOTP key, then lint, typecheck, test, test:tenancy |

**Doc changes**
- README 3: `.github/workflows/ci.yml` in the structure.
- README 5.1.6: where the isolation test goes, and that the suite fails without it.
- README 8: what `npm test` and `test:tenancy` run, the test database and Redis database, CI.

**Problems hit and fixed:** none. The local migrator already had `CREATEDB` (docker-init.sh); CI grants it explicitly.

**Verified:** `npm run format`, `typecheck`, `lint`, `npm test`, `npm run test:tenancy` — run by the user, all passing; development data unchanged (old `[test]` garages kept by choice). First CI run on GitHub Actions for `1d17b77`: green (lint, typecheck, test, test:tenancy).
**Commit:** `1d17b77` — `Phase 1.7: own test database, tenancy suite with route coverage, CI`

**Phase 1 complete:** admin creates a garage, the owner logs in, `test:tenancy` proves isolation (locally and in CI), and a suspended garage is locked.

---

## Phase 1 · Step 1.8 — Project review and fixes
**When:** 2026-10-23 (review ~40 min, fixes ~40 min)

**Why:** before Phase 2 the user asked for a scan of the whole project for bugs and future risks. The review read the API, database, both web apps, tests and CI, and confirmed one bug by running it. Findings were ranked: fix now, fix before the first deployment, later.

**Decisions (user, 2026-10-23):** add a phone-number library (`libphonenumber-js`); a branch with active staff is **blocked** from being deactivated until they are moved.

**Fixed in this step**
1. **Staff guard could be skipped with capital letters (high, confirmed).** Routing ignores case, but `StaffGuard` chose routes by `req.path.startsWith('/v1/')`, so `/V1/branches` reached the controller with no session, lock or role check (it only failed with 500 because `TenantDb` refuses to run without a garage, so no data leaked). The guard now decides by the controller's declared path.
2. **Phones were not normalized (docs ≠ code).** database.md requires E.164; the code accepted any text. New `phoneSchema` / `optionalPhoneSchema` / `normalizePhone` in contracts (default country Lebanon), used for garage and branch phones; Phase 2 reuses it for owners, whose phone is their login.
3. **Deactivating a branch left its staff in it.** Now `BRANCH_HAS_STAFF` while active staff are assigned; nobody can be moved or reactivated into an inactive branch (`BRANCH_INACTIVE`).
4. Turbo cached test results (a run could replay "passed" without touching the fresh test database) → `cache: false` for `test` and `test:tenancy`.
5. CI did not check formatting → `npm run format:check` step.
6. A Redis failure right after an invite was saved turned the request into a 500 (the admin would retry and hit `EMAIL_ALREADY_USED`) → the failure is logged and the row stays `QUEUED`.

**Recorded for the first deployment (README 9 checklist):** real client IPs behind the web apps' forwarding (otherwise all users share one rate limit), production settings and security headers, emails stuck in `QUEUED`.

**Noted for later:** sessions table cleanup job (Phase 4); set-password link consumed non-atomically (two simultaneous clicks both succeed); admin TOTP code reusable within its ~90 s window; no audit row when a password is set while the garage is locked; one email = one staff account across all garages (product constraint to confirm); every new table needs its own `GRANT` (no default privileges).

**Files changed**
| File | Change |
|---|---|
| `apps/api/src/auth/staff.guard.ts` | Staff routes chosen by controller path metadata |
| `packages/contracts/src/phone.ts` (new), `index.ts`, `garages.ts`, `staff.ts`, `package.json` | Phone rule with `libphonenumber-js` ^1.13.15 |
| `packages/contracts/src/errors.ts` | `BRANCH_HAS_STAFF`, `BRANCH_INACTIVE` |
| `apps/api/src/branches/branches.service.ts`, `users/users.service.ts` | Branch deactivation and placement rules |
| `apps/api/src/auth/user-access-links.service.ts` | Queue failure after commit is logged, not thrown |
| `apps/api/test/staff-auth.spec.ts`, `staff-management.spec.ts`, `admin-garages.spec.ts` | Case-variant URLs get 401; phone normalization and rejection; branch rules |
| `apps/*/messages/*.json` | New error messages and phone hints (en, ar) |
| `packages/database/src/seed.ts` | Demo phone in E.164 |
| `turbo.json`, `packages/database/turbo.json`, `.github/workflows/ci.yml` | No test caching; `format:check` in CI |

**Doc changes**
- database.md 1: how phones are normalized. database.md 4.2: branch deactivation and placement rules.
- flow.md 2.5: how `StaffGuard` picks its routes.
- README 9: three new deploy checks.

**Verified:** `npm install`, `format:check`, `typecheck`, `lint`, `npm test`, `npm run test:tenancy` — run by the user, all passing; browser check by the user (invalid and local phone numbers in admin and garage-web, branch with a mechanic blocked until the mechanic was moved).
**Commit:** `9569b7b` — `Phase 1.8: project review fixes (guard by controller path, E.164 phones, branch staff rule, CI format check)` (CI green)

---

## Phase 2 · Step 2.0 — Doc fixes before Phase 2
**When:** 2026-10-23 (~10 min)

**Summary:** Fixed the two inconsistencies the first docs review deferred to Phase 2, and recorded the two confirmations Phase 2 needs. Phase 2 is split into steps 2.1–2.6 (status table).

**Decisions (user, 2026-10-23):**
- In Phase 2, "Confirm and finish" saves the visit and closes it (`DONE`, `finishedAt`); Phase 3 adds the invoice to the same action (first-review item 8: the docs had Phase 2 quick entry creating invoices, which are Phase 3).
- The default service intervals in database.md 4.4 are confirmed as seed values (garages can override).
- 35 km/day for a car with no history is confirmed: a constant in `contracts` until `system_settings` exists (Phase 5), overridable per garage with `garage_settings.defaultDailyKm`.

**Doc changes**
- flow.md 4.1 (diagram, step 4), 4.2 (quick entry without invoice; phase split note), 4.4.
- database.md 4.4: `visits.finishedAt` note; `service_records.nextDueKm/nextDueDate` now points to flow.md section 6 (was "section 4", first-review item 11); seed intervals confirmed.
- README 7: daily-km decision confirmed.

**Verified:** docs only (read through).
**Commit:** `cfb2d54` — committed together with step 2.1 (both change database.md)

---

## Phase 2 · Step 2.1 — Database: customers, vehicles, services, visits, reminders
**When:** 2026-10-23 ~12:00 → 2026-10-24 (about 1 h of work; verified the next day)

**Implements:** database.md 4.1 (`owners`), 4.3, 4.4, 5 (enums), 6.2, 7, 9 (seed item 2), 10 (forward reference `notifications.ownerId`); README 5.1, 5.4.

**Summary:** One migration adds the eight Phase 2 tables (`owners`, `garage_customers`, `vehicles`, `service_types`, `suggestions`, `visits`, `service_records`, `reminders`) and five enums. Every tenant table has the standard RLS policy; `service_types` also lets every garage read the global defaults (`garage_id IS NULL`) while writes stay limited to its own overrides. The seed adds the 11 global service types with the confirmed intervals. No API or screens yet.

**Decisions**
- **Owners: linked-only access** (the user left the choice to me, 2026-10-23). The docs called `owners` a platform table, but adding a customer is garage code. Now `gearva_app` may read an owner only when its own garage has them as a customer (policy `owners_linked_read`), and gets an owner's id only through `find_or_create_owner(phone, name, locale)`, a `SECURITY DEFINER` function that returns just the id. A garage can never browse all owners, and adding a customer stays one transaction. New database.md 6.6.
- **Garage-scoped foreign keys** (beyond the docs, for isolation): links between tenant tables include the garage (`(garage_id, x_id)` → `(garage_id, id)`), so the database refuses a row of garage A pointing into garage B even through the platform role.
- **Grants follow "never deleted":** no `DELETE` for the runtime roles on customers, vehicles, visits, service records, reminders and service types; only suggestions can be deleted.
- **Suggestions prefix index dropped:** Prisma cannot describe a `text_pattern_ops` index, so every later migration would try to remove it; the unique `(garageId, field, valueNormalized)` index narrows to a few dozen rows, which is enough.
- `service_types.detailKey` is nullable (`ENGINE`, `OTHER` have no extra fields); fluid changes use the `oil` details.

**Files changed**
| File | Change |
|---|---|
| `packages/database/prisma/schema.prisma` | 8 models, 5 enums, `@@unique([garageId, id])` on parents (incl. `branches`, `users`), `notifications.owner` relation |
| `packages/database/prisma/migrations/20261023120822_phase2_customers_vehicles_visits/migration.sql` (new) | Prisma's tables plus hand-written partial unique indexes (plates, service type codes), CHECKs, grants, owners RLS policy, `gearva_uuid_v7()`, `find_or_create_owner()`, RLS for the 7 tenant tables |
| `packages/database/src/tenant-tables.ts` | Phase 2 tenant tables; `GLOBAL_DEFAULT_TABLES` adds the `global_defaults_read` policy |
| `packages/database/src/seed.ts` | Global service types (created only when missing, every environment) |
| `packages/database/test/rls.test.ts` | 10 new tests: owner function (one id per phone, UUID v7, input checks, needs a tenant), linked-only owner reads, no direct owner writes, global + own service types only, no writes to global rows, unique global codes, cross-garage link refused, plate unique among cars not deleted, negative km refused, no DELETE on never-deleted tables |

**Doc changes**
- database.md 2, 4.1: `owners` exception. 4.4: `detailKey`, suggestions index note. 6.1: `gearva_app` rights, managed-Postgres note covers `owners`. New 6.6. 7: new unique keys and CHECKs. 9, 10: seed and forward reference done.

**Problems hit and fixed:** the first schema check (migration applied to a scratch database, then `prisma migrate diff` against the schema) showed Prisma would drop the suggestions prefix index → index removed, check re-run: empty diff. The scratch database was deleted afterwards.

**Verified:** by me: 17 database tests on the test database, typecheck and lint of the database package and API, empty schema diff. By the user: `prisma migrate dev`, `npm run db:seed` (11 service types), `format:check`, `typecheck`, `lint`, `npm test`, `npm run test:tenancy`.
**Commit:** `cfb2d54` — `Phase 2.0 + 2.1: doc fixes, Phase 2 database (owners, customers, vehicles, service types, visits, records, reminders)` (CI green)

---

## Phase 2 · Step 2.2 — Calculations (km/mi, plates, daily km, next due, line totals)
**When:** 2026-10-26 (~40 min)

**Implements:** flow.md 4.3 (suggestion normalization), 5 (average daily usage, estimated km, odometer rules), 6 (next-change logic); database.md 1 (plates), 4.4 (`service_records.totalCents`); README 5.4 (money in cents, km internally), 8 (unit tests for the pure logic).

**Summary:** The pure rules Phase 2 needs now live in `packages/contracts`, shared by the API and the web apps, each with unit tests and edge cases: km ↔ miles; plate normalization (uppercase, Arabic-Indic digits as ASCII, no spaces or dashes); suggestion normalization; average daily km (last 5 readings, clamp 5..300, a lower reading restarts it); estimated current km (car → garage default → 35 km/day, whole days, never backwards); odometer check (`OK` / `CORRECTION` / `TYPO` at more than 5,000 km per day); interval resolution (garage override → global, miles interval for cars on miles); next due km and date (calendar date in the garage's time zone, end-of-month clamping); line total in integer cents.

**Decisions (2026-10-24/26):**
- Line total = quantity × unit price, rounded to the nearest cent with halves up, computed in integers (first-review item 10; a float would turn 4.35 × 110 into 478.4999… and round the wrong way).
- A lower odometer reading restarts the average (flow.md 5.3) instead of being dropped (old 5.1 text): after an odometer replacement, dropping every new reading would freeze the average.

**Files changed**
| File | Change |
|---|---|
| `packages/contracts/src/distance.ts`, `text-normalize.ts`, `odometer.ts`, `next-due.ts`, `money.ts` (new), `index.ts` | The calculations |
| `packages/contracts/test/*.test.ts` (new) | 35 unit tests |
| `packages/contracts/package.json`, `tsconfig.json`, `tsconfig.build.json` (new), `vitest.config.mts` (new) | Vitest (same version as `packages/database`), `test` script, build only from `src` |

**Doc changes**
- flow.md 5.1 (correction restarts the average, rounding), 5.2 (whole days, rounding, fallbacks), 5.3 (jump per day, check results), 6 (date in the garage's time zone, month-end clamp).
- database.md 1 (plate normalization), 4.4 (`totalCents` rounding).

**Verified:** by me: 35 contracts tests, typecheck/lint/build of `contracts`, typecheck of API, garage-web and admin. By the user: `npm install`, `format:check`, `typecheck`, `lint`, `npm test`, `npm run test:tenancy`.
**Commit:** `37eec1c` — `Phase 2.2: shared calculations (km/mi, plates, daily km, next due, line totals) with unit tests` (CI green)

---

## Phase 2 · Step 2.3 — API: customers, vehicles, search, suggestions
**When:** 2026-10-26 (~1 h)

**Implements:** flow.md 1 (all roles add customers and cars), 3.1, 3.2, 3.2.1, 3.3, 4.3, 12 (audit on viewing a customer), 13 (same phone twice, same plate in two garages); database.md 4.3, 6.6; README 5.1.6 (tenancy case per endpoint).

**Summary:** Garage staff can add a customer by name and phone (any format, stored E.164; the owner is found or created with `find_or_create_owner()`, then linked), get the existing customer back for a phone the garage already has (200, `created: false`), view and edit customers, add any number of cars (odometer in the car's unit, stored in km), view and edit cars (with today's estimated km), search by plate prefix or phone ending, and get autocomplete suggestions. A plate already used in the garage answers `409 VEHICLE_PLATE_EXISTS` with the existing car. New customers get an app invite recorded for WhatsApp and logged `SKIPPED` (no email is collected yet). Viewing a customer or a car writes an audit row.

**Decisions**
- Search returns one row per car; a phone match also returns a customer without a car (`vehicle: null`), so staff can add one. Phone matching needs at least 4 digits and phone-like text; leading zeros are dropped so the local form matches the E.164 ending.
- Suggestions are upserted with one `INSERT … ON CONFLICT` statement (no lost update or failed save when two staff type a new value at once); ids come from a small UUID v7 helper because raw SQL skips Prisma's default.
- The odometer of a car changes only through visits (2.4).

**Files changed**
| File | Change |
|---|---|
| `packages/contracts/src/customers.ts`, `suggestions.ts` (new), `errors.ts`, `index.ts` | Schemas and types for customers, vehicles, search, suggestions; `VEHICLE_PLATE_EXISTS` |
| `apps/api/src/customers/*` (new) | `CustomersService` (find-or-link, view audit, invite), `SearchService` (parameterized SQL in the tenant transaction), controllers, mappers |
| `apps/api/src/vehicles/*` (new) | Cars: create, detail with estimate, update, plate conflicts (also under a race) |
| `apps/api/src/suggestions/*` (new) | List and record |
| `apps/api/src/common/uuid-v7.ts` (new), `app.module.ts` | UUID v7 helper; modules registered |
| `apps/api/test/customers.spec.ts` (new) | 15 feature tests |
| `apps/api/test/tenancy.spec.ts`, `helpers/staff.ts` | 8 new isolation cases (B's rows incl. customers, cars and suggestions must stay identical); `randomPhone`, `signInAsStaff` helpers |

**Doc changes**
- flow.md 3.1, 3.2, 3.3, 4.3: the API behaviour; 14: `/v1/customers/:id/vehicles`, `/v1/search`.

**Verified:** by me: 89 API tests (9 suites) on a fresh test database, typecheck, lint. By the user: `format:check`, `typecheck`, `lint`, `npm test`, `npm run test:tenancy`.
**Commit:** `50d0736` — `Phase 2.3: customers, vehicles, search and suggestions API` (CI green)

---

## Phase 2 · Step 2.4 — API: quick entry, visits, records, reminders, history
**When:** 2026-10-26 (~1.5 h, including two fixes after the user's first test run)

**Implements:** flow.md 1 (who creates visits; branch scope), 4.1–4.4 (quick entry, longer jobs, finish), 5 (odometer, average, estimate, confirmations), 6 (next due, reminders), 13 (price 0, two staff finishing at once); database.md 4.4, 8 (history timeline); README 5.6 (audit on every mutation).

**Summary:** The quick-entry API works. `POST /v1/visits/quick` saves the visit, its service records (integer-cent totals, details checked against the type, next due km and date or the mechanic's own values), the reminders (previous due reminder of the same service code completed; warranty end and "recommended in N months" added), the car's odometer and average daily km, and the suggestions, all in one transaction; with `finish` the visit is closed and a `CAR_READY` notification is recorded (WhatsApp, `SKIPPED` until a channel exists). An unusual odometer (lower, or more than 5,000 km per day) answers `409 ODOMETER_CONFIRMATION_REQUIRED` until confirmed; a confirmed correction is audit logged. Longer jobs: open, add records, wait for parts, finish (row lock: a second finish gets `VISIT_ALREADY_FINISHED`; no records gets `VISIT_HAS_NO_RECORDS`). Also: the effective service-type list (garage override replaces the default), the quick-entry prefill (estimated km, "last used for this car") and the car's history timeline. Receptionists read but do not create or change visits; staff of one branch record and see only that branch.

**Decisions (where the docs were silent, now in flow.md):** visit branch rules; reminders match by service code (`OTHER` never completes another custom service); the average uses one reading per visit plus the car's reading before the visit, so a new car gets an average at its first visit.

**Files changed**
| File | Change |
|---|---|
| `packages/contracts/src/visits.ts` (new), `errors.ts`, `index.ts` | Service line, quick/open/records/update schemas, `details` shapes per type, answers; `ODOMETER_CONFIRMATION_REQUIRED`, `VISIT_ALREADY_FINISHED`, `VISIT_HAS_NO_RECORDS` |
| `apps/api/src/maintenance/*` (new) | `ServiceTypesService` (effective list, override resolution), `RecordsService` (lines, reminders, suggestions, prefill, history), controller |
| `apps/api/src/visits/*` (new) | `VisitsService` (open with branch and odometer rules, quick, records, status, finish with `FOR UPDATE`, CAR_READY), controller |
| `packages/database/src/service-types-seed.ts` (new), `seed.ts`, `scripts/prepare-test-db.ts` | Service-type list shared by the seed and the test database |
| `apps/api/test/visits.spec.ts` (new), `tenancy.spec.ts` | 16 feature tests; 9 isolation cases (B also has an open visit and its own service type override; B's visits, records, reminders and types must stay identical) |
| `apps/api/src/common/db/tenant-db.ts`, `branches/`, `users/`, `customers/search.service.ts`, `vehicles/`, `maintenance/`, `visits/` | No `Promise.all` inside a transaction (see below) |
| `packages/database/test/rls.test.ts` | Its temporary global service type is inactive (see below) |

**Doc changes**
- flow.md 4.2 (implemented rules), 4.4 (CAR_READY channel), 5.1 (readings), 6 (reminder matching), 14 (prefill, history).
- README 8: the test database also gets the global service types.

**Problems hit and fixed**
- The user's first `npm test` failed one test: turbo runs the database and API tests at the same time on the same test database, and a database test's temporary *global* service type showed up in the API test's service-type list (my own runs were one after the other). The temporary type is now inactive; the full parallel run passed three times.
- `pg` warned "calling client.query() when the client is already executing a query" (to be removed in pg 9): our code ran `Promise.all` on one transaction's connection in 7 places → now sequential, and the rule is written on `TenantDb.run`. Two warnings remain from inside Prisma (it loads `include` relations in parallel on the transaction); nothing to change on our side, recheck when upgrading Prisma.

**Verified:** by me: full parallel `npm test` (112 API, 35 contracts, 17 database tests) three times, typecheck, lint. By the user: `format:check`, `typecheck`, `lint`, `npm test`, `npm run test:tenancy` (27 tenancy tests).
**Commit:** `2f750f2` — `Phase 2.4: quick entry, visits, service records, reminders and history API` (CI green)

---

## Phase 2 · Step 2.5 — garage-web: search, customers, cars
**When:** 2026-10-27 → 2026-10-29 (~1.5 h of work; browser check by the user)

**Implements:** flow.md 3.1, 3.2, 3.2.1, 3.3 (screens), 4.3 (autocomplete), 12 (audit on viewing; no export); README 5.4 (money in cents, km internally), 5.7 (mobile-first, TanStack Query, react-hook-form with the API's Zod schemas, next-intl, logical Tailwind classes).

**Summary:** The garage app now has the customer side. The home page is the search for every role (plate or phone, results as you type). Staff add customers (any phone format; a known phone opens that customer's file with a note), view and edit a customer (name, notes, opt-outs; the phone is fixed), add cars (make and model with the garage's autocomplete, km or miles; a plate already registered shows that car with a link), and open a car (estimated km today, last reading, average per day, service history). A new **Customers** page lists all customers, newest first, paginated, with a name or phone filter.

**Decision (user, 2026-10-27):** a customer list page exists and **every staff role** may browse it (options were owner+manager, all roles, owner only). It stays within README 5.4: paginated (max 50), rate limited, no export.

**Files changed**
| File | Change |
|---|---|
| `packages/contracts/src/customers.ts` | `customerListQuerySchema`, `CustomerListItem` |
| `apps/api/src/customers/customers.service.ts`, `customers.controller.ts` | `GET /v1/customers` (filter by name or phone ending, car counts, 60 requests/minute) |
| `apps/api/test/customers.spec.ts`, `tenancy.spec.ts` | 2 feature tests; isolation case for the list |
| `apps/garage-web/features/search/*`, `features/home/home-screen.tsx` | Search home |
| `apps/garage-web/features/customers/*` | New customer, customer file with edit, customer list |
| `apps/garage-web/features/vehicles/*` | Car form (create/edit), new car, car page, service history |
| `apps/garage-web/components/suggest-input.tsx`, `lib/format.ts`, `lib/use-debounced-value.ts` | Autocomplete input (native datalist); money formatted from exact decimal text (no float), distances in the car's unit; debounce |
| `apps/garage-web/app/[locale]/(app)/customers/**`, `vehicles/[vehicleId]/page.tsx`, `components/app-shell.tsx` | Routes; "Customers" header link |
| `apps/garage-web/messages/en.json`, `ar.json` | All new texts (both files keep the same keys) |
| `packages/ui/src/index.tsx` | `Input`, `Select`, `Textarea` typed with `ComponentProps` so `ref` is typed (React 19 passes it) |

**Doc changes**
- flow.md 3.1 (customer list endpoint and decision), 3.3 (the search screen and the Customers page).

**Problems hit and fixed:** `@gearva/ui` inputs did not declare `ref` in their types → `ComponentProps`; the car form's edit mode used an `as never` cast → a typed edit schema without the odometer.

**Verified:** by me: typecheck and lint (garage-web, admin, ui), `next build` of garage-web, en/ar key check, full parallel `npm test` (115 API tests). By the user: `format:check`, `typecheck`, `lint`, `npm test`, and the 14-step browser check (add customer, same phone twice, bad phone, car in miles, autocomplete, duplicate plate, search by plate and phone, customer without a car, edits, Customers page and filter, Arabic).
**Commit:** `2350892` — `Phase 2.5: garage-web search, customers, cars and customer list`

---

## Design prototype review and decisions
**When:** 2026-10-29 (~30 min, docs only)

**Summary:** The user shared the design prototype ("Gearva Demo.html": website, garage V1, admin V2, phone app, workflow). It is the visual design for **both existing apps** (garage-web and admin stay the real frontends; only the look changes). Reviewed: clear tokens (orange `#FF600F`, dark `#101A19`, warm background, Plus Jakarta Sans, dark mode), 44 px touch targets, the same flows as the docs; no Arabic yet (left/right in CSS, to become logical properties). The prototype also embedded product decisions; the user answered each.

**Decisions (user, 2026-10-29)**
- **Owner app login: email + password given by the garage** (prototype), replacing phone + one-time code. Recorded in README 1, 5.2, 6 (Phase 6), 7, and flow.md 2.4; details (who sets the password, reset, an owner at two garages) are settled at the start of Phase 6, with database.md.
- Staff keep **personal accounts with roles** (not one shared garage login).
- Garage owners keep **invite links** (the admin never sees a password).
- **Public website + application form + admin Applications page**: added to Phase 5 in README 6.
- Kept as built/confirmed (prototype differs): exact mile factor 1.609344 (prototype 0.72 is wrong), confirmed service intervals, price decided in Phase 5, text-selection lock only on customer lists.
- Plan: finish 2.6 in the current plain style, then a **design step** before Phase 3 (tokens and components in `packages/ui`, then page layouts, both apps, English and Arabic).

**Doc changes:** README 1, 5.2, 6 (Phase 5 website, Phase 6 login), 7; flow.md 2.4 (change note).

**Verified:** docs only.
**Commit:** `5117d47` — `Changes in docs after setting the design pages` (CI green)

---

## Phase 2 · Step 2.6 — garage-web: quick entry, visits (Phase 2 done)
**When:** 2026-11-01 (~1.5 h of work; browser test by the user)

**Summary:** The quick-entry screen (flow.md 4.1). Search → tap the car → tap a service button → a pre-filled form (odometer from today's estimate, brand/grade/quantity/price from the last time on this car, next due km and date updated as you type) → **Confirm and finish** or **Confirm and add another**. An unusual odometer asks "Is this right?" (**Yes, save** / **Fix it**). "More details" holds labour/parts, warranty, the recommended months, your own next due, "no reminder" and notes. The visit page shows the services, next due values and total, and for an open visit: add another service, waiting for parts / parts arrived, finish. History lines link to their visit. Service buttons show for owner, manager and mechanic only (flow.md 1.2). No API changes.

**Files changed**
| File | Change |
|---|---|
| `apps/garage-web/features/quick-entry/service-picker.tsx` | Service types query, big service buttons, `canRecordServices` |
| `apps/garage-web/features/quick-entry/service-form.tsx` | The pre-filled form, live next due, odometer confirmation, save to `POST /v1/visits/quick` or `POST /v1/visits/:id/records` |
| `apps/garage-web/features/quick-entry/quick-entry-page.tsx` | New visit for a car; add a service to an open visit |
| `apps/garage-web/features/visits/visit-page.tsx` | Visit summary, finish, waiting for parts, add another |
| `apps/garage-web/app/[locale]/(app)/vehicles/[vehicleId]/service/page.tsx`, `visits/[visitId]/page.tsx`, `visits/[visitId]/add/page.tsx` | Routes |
| `apps/garage-web/features/vehicles/vehicle-page.tsx`, `service-history.tsx` | Service buttons on the car page; history lines link to the visit |
| `apps/garage-web/lib/format.ts` | `dollarsToCents` (typed dollars → integer cents, no float) |
| `apps/garage-web/messages/en.json`, `ar.json` | `quick` and `visit` texts (264 keys each) |

**Doc changes**
- flow.md 4.1: the garage-web quick-entry screen.
- README 5.7: the visual design comes from the user's prototype (`docs/design/gearva-demo.html`), applied in the design step.

**Notes from the test**
- Checked with the user: next due values for steering oil (car in miles, 45,000 → 70,000 mi, +24 months), AC (date only, +12 months), gear oil (+40,000 km, +24 months), differential oil (+60,000 km, +36 months), battery (date only, +24 months) all match the database.md 4.4 intervals.
- An empty price saves as $0.00 on purpose (free/warranty work). Whether to ask "Save as free?" is decided in Phase 3 with invoices.
- User asked about paid/unpaid and a money report: both are already planned (Phase 3 payments + debt list, flow.md 7.1, 8; Phase 7 revenue screens, flow.md 8.3). Possibly moving a simple income screen into Phase 3 is to be decided when Phase 3 starts.

**Phase 2 Done when:** a mechanic can add a customer, car and service on a phone with correct next due km/date. The user tested the flow and confirmed it works; the next due values were checked (above). Stopwatch times were not reported.

**Verified:** by me: typecheck and lint (garage-web), `next build` of garage-web (the three new routes), en/ar key check. By the user: the browser test of quick entry, add another, visit page and history.
**Commit:** `7305e63` — `Phase 2.6: garage-web quick entry, visit page and service buttons (Phase 2 done)`

---

## Design · Step D.1 — colours, dark mode, fonts, shared components, sidebar
**When:** 2026-11-02 (~1 h of work)

**Summary:** First half of the design step: every screen of garage-web and admin takes the prototype's look (`docs/design/gearva-demo.html`). Named colour tokens with automatic dark mode, Plus Jakarta Sans plus IBM Plex Sans Arabic, restyled buttons, inputs (44 px high), cards and alerts, the Gearva logo, and a dark sidebar that becomes a top row on phones. No API, data or logic changes. Page layouts (login split screen, tables, status pills) are step D.2.

**Files changed**
| File | Change |
|---|---|
| `packages/ui/src/theme.css` | New: tokens from the prototype, light and dark |
| `packages/ui/src/index.tsx` | Restyled components; new `buttonClass`, `Logo`, `navItemClass`, `AppFrame` |
| `apps/*/app/globals.css`, `apps/*/app/[locale]/layout.tsx` | Load the tokens and both fonts (`next/font`, no new package) |
| `apps/garage-web/components/app-shell.tsx`, `apps/admin/components/panel-shell.tsx` | Sidebar with the current page highlighted |
| `apps/*/components/language-toggle.tsx`, `apps/*/features/auth/auth-layout.tsx` | Sidebar styling option; logo on sign-in pages |
| `apps/garage-web/messages/en.json`, `ar.json` | New `nav.home` (Search), so the sidebar has a way back to search |
| `apps/*/features/**` (36 files) | Palette colours replaced with tokens; shadows removed |

**Doc changes:** README 5.7 (tokens and the Arabic font).

**Decisions:** inputs use 16 px text on phones (the prototype's 14 px makes iPhones zoom in on tap). Dark mode follows the device; no switch in the app yet.

**Verified:** by me: typecheck and lint (ui, garage-web, admin), `format:check`, `next build` of both apps, tokens present in the compiled CSS, en/ar keys match (garage-web 265, admin 150). By the user: browser check of both apps.
**Commit:** `3ab5972` — `Design D.1: colours, dark mode, fonts, shared components and sidebar`

---

## Design · Step D.2 — page layouts
**When:** 2026-11-02 (~45 min of work)

**Summary:** Second half of the design step. Sign-in pages use the prototype's split screen (dark pitch panel beside the form, stacked on a phone). Status labels are one `Pill` component with the prototype's four tones. Next due values sit in the orange-tinted box on the form and the visit page. The admin garage table, plates and customer names follow the prototype's type. Prototype screens that need later data (dashboard stat cards, invoices, reminders, offers, revenue) are built in their own phases, in this same style.

**Files changed**
| File | Change |
|---|---|
| `packages/ui/src/index.tsx` | New `Pill`, `AuthFrame` |
| `apps/*/features/auth/auth-layout.tsx` | Split-screen sign-in |
| `apps/*/messages/en.json`, `ar.json` | `authSide` texts |
| `apps/garage-web/features/{branches,customers,staff,vehicles,visits}/*`, `apps/admin/features/garages/status-badge.tsx` | Labels use `Pill` |
| `apps/garage-web/features/quick-entry/*`, `visits/visit-page.tsx` | Next due box, service buttons |
| `apps/admin/features/garages/garage-list.tsx`, `apps/garage-web/features/{customers,search,vehicles}/*` | Table header, plates and names |

**Doc changes:** none (README 5.7 covers it).

**Differences from the prototype, on purpose:** the admin sign-in text says "Create garages and invite their owners" (the prototype's "create the email and password" is not how accounts work: flow.md uses invite links) and leaves out WhatsApp volume (a later feature). Staff sign-in has no Garage/Admin switch: they are separate apps.

**Verified:** by me: typecheck and lint (ui, garage-web, admin), `format:check`, `next build` of both apps, en/ar key check. By the user: browser check of both apps.
**Commit:** `ec3450c` — `Design D.2: sign-in split screen, status labels and page layouts`

---

## Phase 3 · Step 3.0 — Doc fixes and Phase 3 decisions
**When:** 2026-11-02 (~20 min, docs only)

**Decisions (user, 2026-11-02)**
- **Simple income summary in Phase 3:** today and this month, received vs invoiced, owners and managers only (README 6, flow.md 8.3). The full revenue screens stay in Phase 7.
- **"Paid now?" at finish:** Paid in full, Part or Pay later, with Cash or Whish (flow.md 7.1).
- **Free work asks first:** a total of 0 needs confirming ("No price. Save as free?"), so a forgotten price does not become a numbered invoice (flow.md 7.1).
- **VAT off by default,** with a garage setting (README 7).

**Filled in by me, for the user to overrule**
- ~~The permission matrix lets mechanics finish a visit but not record a payment, so "Paid now?" shows only to roles that may record one.~~ Changed by the user the same day: mechanics may record a payment while finishing, but not later (flow.md matrix, 7.1).
- A confirmed free invoice is `PAID` at once with no `payments` row, because a payment must be above 0.

**Doc changes:** README 6, 7. flow.md permission matrix, 7.1, new 8.3 (old 8.3 is now 8.4). database.md 4.4 ("one payment per visit" corrected: item 9 of the first docs review), 4.5, 5, 6.1, 7, 10.

**Verified:** docs only.
**Commit:** `ee179a2` (with step 3.1)

---

## Phase 3 · Step 3.1 — Database: invoices, payments, offers, files
**When:** 2026-11-02 (~1 h of work)

**Implements:** database.md 4.2 (`invoiceEditWindow`, logo FK), 4.5, 4.6, 5, 6.1, 6.2, 7, 10; README 5.1, 5.4.

**Summary:** One migration adds `files`, `offers`, `invoice_counters`, `invoices`, `invoice_items`, `payments` and six enums, with RLS on all six tables. The `offers` table exists now so `invoices.offerId` has a real foreign key; offer screens stay in Phase 7. No API or screens yet.

**Decisions**
- Beyond the docs: `U(branchId, year, seq)` as a last guard against a repeated number, a CHECK that `total = subtotal - discount + vat`, and garage-scoped foreign keys on every link, like Phase 2.
- `invoices`, `invoice_counters` and `offers` have no DELETE for the runtime roles. `invoice_items` keeps DELETE, because an edit replaces the lines.
- `InvoiceEditWindow` has one value today (`SAME_DAY`): the only rule the docs define.

**Files changed**
| File | Change |
|---|---|
| `packages/database/prisma/schema.prisma` | 6 models, 6 enums, `invoiceEditWindow`, logo relation |
| `packages/database/prisma/migrations/20261102092321_phase3_invoices_payments/migration.sql` (new) | Prisma's tables plus the partial unique index, CHECKs, grants, RLS |
| `packages/database/src/tenant-tables.ts` | Phase 3 tenant tables |
| `packages/database/test/rls.test.ts` | 6 new tests: one active invoice per visit and reissue, repeated number, totals that do not add up, append-only payments, cross-garage refusal, counter per branch and garage |

**Doc changes:** in step 3.0.

**Verified:** by me, on the test database: 23 database tests, 115 API tests, 28 tenancy tests, typecheck of database and API, `format:check`, and no difference between the migrated database and the schema. By the user: `prisma migrate dev`, `typecheck`, `npm test`, `test:tenancy`.
**Commit:** `ee179a2` — `Phase 3.0 + 3.1: decisions in docs, invoices, payments, offers and files tables`

---

## Phase 3 · Step 3.2 — Calculations: totals, discount, VAT, invoice number
**When:** 2026-11-02 (~20 min of work)

**Implements:** flow.md 7.1, 7.3, 7.4; README 5.4 (money in cents), 8 (unit tests for pure logic).

**Summary:** Pure functions in `contracts`, shared by the API and the screens: discount, VAT, invoice totals, payment status, invoice number formatting and its validity check, and the earliest next due of a visit. All integer cents with halves rounding up. No API or screens yet.

**Decisions:** VAT is charged after the discount. A discount above the subtotal stops at the subtotal, so a total is never negative. A number format must hold branch, year and sequence, because the number is unique across the garage.

**Files changed**
| File | Change |
|---|---|
| `packages/contracts/src/invoices.ts` (new), `index.ts` | The calculations; invoice status, payment method and discount type lists |
| `packages/contracts/test/invoices.test.ts` (new) | 20 tests |

**Doc changes:** flow.md 7.1 (format rule; mechanics may record a payment at finish, decision 2026-11-02), permission matrix, 7.4 (VAT after discount).

**Verified:** by me: 55 contracts tests, typecheck and lint of contracts, typecheck of the API. By the user: `format:check`, `typecheck`, `npm test`.
**Commit:** `f16bd7d` — `Phase 3.2: invoice calculations (totals, discount, VAT, numbers) with unit tests`

---

## Phase 3 · Step 3.3 — API: finish creates the invoice, payments, free work
**When:** 2026-11-02 (~1.5 h of work)

**Implements:** flow.md 7.1, 7.3, 8.1; database.md 4.5.

**Summary:** "Finish visit" and quick entry with `finish` now issue the invoice in the same transaction: a gap-free number, lines and copies of the customer, car and garage, totals with an optional typed discount and VAT, and an optional payment. New `GET /v1/invoices/:id` and `POST /v1/invoices/:id/payments`. A visit's answer carries its invoice summary. No screens yet.

**Decisions**
- Picking an offer on an invoice moves to Phase 7, because no offer can exist before the offer screens. Typed discounts are built (README 6, flow.md 7.4).
- Anyone who can finish a visit can type a discount, which matches the matrix (a mechanic may edit an invoice the same day). The invoice keeps who created it.
- Paying more than the total, or a refused free invoice, rolls back the whole request: no visit, no record, no number used.

**Until step 3.6:** garage-web sends no finish options, so finishing with a total of 0 shows an error, and every finish is Pay later.

**Files changed**
| File | Change |
|---|---|
| `apps/api/src/invoices/*` (new) | Service (issue, payments, detail), controller, module |
| `apps/api/src/visits/visits.service.ts`, `visits.controller.ts`, `visits.module.ts`, `app.module.ts` | Finish issues the invoice; finish options; audit of a payment taken at finish |
| `apps/api/src/maintenance/records.service.ts` | Date helpers exported |
| `packages/contracts/src/invoices.ts`, `visits.ts`, `errors.ts` | Request schemas, answers, `INVOICE_TOTAL_ZERO`, `INVOICE_CANCELLED`, `PAYMENT_EXCEEDS_REMAINING` |
| `apps/api/test/invoices.spec.ts` (new) | 21 tests, including 8 visits finishing at once and two payments at once |
| `apps/api/test/tenancy.spec.ts`, `visits.spec.ts` | Isolation cases for the two routes, invoices and payments in garage B's snapshot; free-work confirmation in older cases |

**Doc changes:** README 6; flow.md 4.2, 7.1, 7.4, 8.1.

**Problems hit and fixed:** nested `items.createMany` is refused by Prisma when the foreign key includes `garageId` → lines are created in a second step of the same transaction.

**Verified:** by me, on the test database: 138 API tests, 30 tenancy tests, all contracts and database tests, lint of the API, typecheck of the API and both web apps. By the user: `format:check`, `typecheck`, `npm test`, `test:tenancy`.
**Commit:** `c95a4b2` — `Phase 3.3: finishing a visit issues the invoice, payments and free work API`

---

## Phase 3 · Step 3.4 — API: edit, cancel, reissue, debt list, income summary, settings
**When:** 2026-11-02 (~1.5 h of work)

**Implements:** flow.md 7.5, 8.2, 8.3; database.md 4.2, 4.5, 8.

**Summary:** The rest of the invoice API. `PATCH /v1/invoices/:id` edits quantities, prices and the discount; `POST .../cancel` and `POST .../reissue` fix a mistake without deleting anything; `GET /v1/invoices` lists them, including `refundNeeded`; `GET /v1/debts` groups what customers owe; `GET /v1/income` gives today and this month, received vs invoiced; `GET` and `PATCH /v1/invoice-settings` hold the number format, terms, VAT and brand colour. No screens yet.

**Decisions**
- **New column `invoices.vat_rate_percent` (beyond the docs):** without it, editing an old invoice would use the garage's current VAT rate and change a past tax amount.
- An edit changes quantities, prices and the discount only. Adding or removing a line is cancel and reissue.
- A reissue does not carry payments over: the cancelled invoice stays "refund needed", and the new one starts unpaid unless a payment is entered. The docs left this open.
- Mechanics do not get the invoice list, only their visit's invoice.
- `autoSendInvoice`, LBP display and payment reminder settings wait for the features that use them.

**Files changed**
| File | Change |
|---|---|
| `apps/api/src/invoices/invoice-changes.service.ts` (new) | Edit, cancel, reissue, who may edit when |
| `apps/api/src/invoices/invoice-reports.service.ts` (new) | Invoice list, debt list, income summary |
| `apps/api/src/invoices/invoice-settings.service.ts` (new) | Invoice settings |
| `apps/api/src/invoices/invoices.controller.ts`, `invoices.module.ts`, `invoices.service.ts` | Routes; the VAT rate is saved; reissue link |
| `packages/database/prisma/schema.prisma`, migration `*_invoice_vat_rate` (new) | `vatRatePercent` |
| `packages/contracts/src/invoices.ts`, `errors.ts` | Schemas, answers, 4 error codes |
| `apps/api/test/invoice-changes.spec.ts` (new) | 18 tests |
| `apps/api/test/tenancy.spec.ts` | 8 isolation cases |

**Doc changes:** database.md 4.5; flow.md 7.5.

**Verified:** by me, on the test database: full `npm test`, `test:tenancy`, typecheck and lint of everything, no difference between the migrated database and the schema. By the user: `prisma migrate dev`, `format:check`, `typecheck`, `npm test`, `test:tenancy`.
**Commit:** `eb06257` — `Phase 3.4: invoice edit, cancel, reissue, debt list, income summary and settings API`

---

## Phase 3 · Step 3.5 — PDF (Arabic + English) and file storage
**When:** 2026-11-02 (~2 h of work)

**Implements:** flow.md 7.2; database.md 4.6; README 3 (Puppeteer in a BullMQ worker, local disk in development).

**Summary:** A BullMQ job renders each invoice to an A4 PDF with Puppeteer, in the customer's language, and keeps it as one file per invoice. It renders again after an edit, payment or cancel. `GET /v1/invoices/:id/pdf` sends it after the role and branch checks and logs the reprint. Owners can upload a logo (PNG or JPEG, up to 1 MB), which is printed on invoices. No screens yet.

**Decisions**
- **New packages:** `puppeteer`, and `@fontsource/plus-jakarta-sans` and `@fontsource/ibm-plex-sans-arabic`. The fonts are embedded in the page, so a server with no Arabic font still prints Arabic correctly.
- **The PDF page has no scripts and no network;** text from people is escaped.
- **The API sends the bytes itself** instead of signed storage links: the role and branch check stays in one place (database.md 4.6 changed).
- **Local storage only for now;** the object storage adapter comes with the deployment, in step 3.8.
- **Left for later:** the optional QR code, and emailing the PDF (`autoSendInvoice`), which needs the real email adapter and owner emails.
- **A small known limit:** a download right after a change can show the previous PDF for a second or two, until the job finishes.

**Files changed**
| File | Change |
|---|---|
| `apps/api/src/invoices/pdf/*` (new) | Template, Chrome renderer and stub, queue, service |
| `apps/api/src/files/*` (new) | `FileStorage` and the local adapter |
| `apps/api/src/invoices/*`, `apps/api/src/visits/visits.service.ts` | PDF and logo routes; a render is queued after every change |
| `apps/api/src/common/errors/all-exceptions.filter.ts`, `packages/contracts/src/errors.ts`, `invoices.ts` | `FILE_TOO_LARGE`, `INVOICE_PDF_NOT_READY`, `hasLogo` |
| `apps/api/src/config/env.ts`, `.env.example`, `packages/database/src/test-environment.ts`, `.gitignore`, `.github/workflows/ci.yml` | `FILES_LOCAL_DIR`, `PDF_ADAPTER`; tests use a stub renderer and CI skips the Chrome download |
| `apps/api/test/invoice-html.spec.ts`, `invoice-pdf.spec.ts` (new), `tenancy.spec.ts` | Template, job, download, logo; 3 isolation cases |

**Doc changes:** flow.md 7.2; database.md 4.6.

**Problems hit and fixed**
- A logo above the limit answered 500 → `413 FILE_TOO_LARGE`.
- Seen only by looking at a real Arabic PDF: the odometer read in the wrong order, unit before number. A left-to-right wrapper was removed, and a test now holds it.

**Verified:** by me: 181 API tests, 41 tenancy tests, typecheck and lint of everything, `format:check`; real English and Arabic PDFs rendered with real Chrome and read page by page. Tests use the stub, so real rendering is not covered by CI. By the user: `npm install`, `format:check`, `typecheck`, `npm test`, `test:tenancy`.
**Commit:** `462f4c1` — `Phase 3.5: invoice PDFs in Arabic and English, file storage and logo`

---

## Phase 3 · Step 3.6 — garage-web: finish step, invoice page, payments
**When:** 2026-11-02 (~2 h of work)

**Implements:** flow.md 1 (permission matrix), 4.1, 7.1, 7.4, 7.5, 7.6, 8.1.

**Summary:** Finishing a visit now opens "Paid now?": Paid in full, Part or Pay later, Cash or Whish, an optional discount, and "No price. Save as free?" when the total is 0. A new invoice page shows the lines, totals and payments, and offers Print / PDF, Record a payment, Edit, Cancel and Issue a new invoice, each only for the roles allowed. All new error codes are translated into English and Arabic.

**Decisions**
- **One finish step:** in the web app, Confirm and finish saves the service first, then opens the step on the visit page. If staff leave the step, the visit stays open and can be finished later. `POST /v1/visits/quick` still accepts `finish` and its options.
- **Nothing is chosen at the start of "Paid now?"**, because a payment cannot be undone. This costs one tap against the 20-second target, which is still not timed on a phone.
- **The total in the step is the real one:** it uses the same calculation as the API. `VisitDetail` gained `vatRatePercent`, because invoice settings are owner-only and a mechanic must still see the VAT.
- **A visit now shows its newest invoice,** not only an active one, so a cancelled invoice stays reachable (flow.md 7.5 changed). The invoice page uses this to link to the replacement and to hide a second reissue.
- **`StaffProfile.garage` gained `timezone`,** so the screen can hide Edit after the day of issue. The API stays the real check.
- **Print opens the PDF in a new tab,** where the browser prints it. It is fetched as a file so an expired session refreshes first.
- **Money in Arabic shows `$`,** not `US$`, matching the PDF.
- **Left for 3.7:** the invoice list, debt list, income summary, invoice settings and logo screens.

**Files changed**
| File | Change |
|---|---|
| `apps/garage-web/features/invoices/*`, `app/[locale]/(app)/invoices/[invoiceId]/page.tsx` (new) | Finish step, invoice page, payment, edit and cancel forms, status pill, discount fields |
| `apps/garage-web/features/visits/visit-page.tsx`, `app/[locale]/(app)/visits/[visitId]/page.tsx`, `features/quick-entry/service-form.tsx` | Finish step and invoice card; quick entry goes to the step |
| `apps/garage-web/lib/api.ts`, `lib/format.ts`, `messages/*.json` | `apiFile`, `$` in Arabic, translations |
| `apps/api/src/visits/visits.service.ts`, `apps/api/src/auth/staff-auth.service.ts`, `packages/contracts/src/visits.ts`, `staff.ts` | `vatRatePercent`, newest invoice on a visit, `timezone` |
| `apps/api/test/invoice-changes.spec.ts` | 2 tests for what a visit shows |
| `apps/api/src/invoices/pdf/invoice-pdf.service.ts`, `apps/api/test/invoice-pdf.spec.ts` | Overlapping renders; 2 tests |

**Doc changes:** flow.md 4.1, 7.1, 7.2, 7.5.

**Problems hit and fixed**
- Seen only in a screenshot: Arabic money read `$US 60.00` → `$`.
- **A bug from step 3.5, found by the user's test run:** `invoice-pdf.spec.ts` failed with 2 files for one invoice. Two render jobs can overlap, and both saw no file yet. The same overlap could be worse: an older job finishing last would replace a newer PDF, so an invoice could print without its latest payment. Now a job remembers the invoice version, then saves under a short row lock only if that version is still current. Chrome runs outside the lock, so payments are not blocked. Two tests hold this.

**Verified:** by me: 185 API tests (the full suite 5 times in a row, after your run caught the bug; both new tests fail on the old code), 41 tenancy tests, all other tests, typecheck and lint of everything, `format:check`. Real Chrome on a phone-size screen against the test database, with real PDF rendering: 22 checks as owner (finish, discount, part payment, invoice page, PDF through garage-web, payment, edit, cancel, reissue, free work, Arabic) and 10 checks on mechanic and receptionist rights and VAT, all passing, with no browser errors. These browser checks are not in the repo and do not run in CI; the Arabic `$` fix came after them and is covered by typecheck only. By the user: `format:check`, `typecheck`, `npm test` (first run caught the overlapping-render bug, fixed above), `test:tenancy`.
**Commit:** `6e89df7` — `Phase 3.6: finish step with Paid now, invoice page, payments, edit, cancel and reissue`

---

## Phase 3 · Step 3.7 — garage-web: invoice list, debt list, income, invoice settings (Done-when check)
**When:** 2026-11-03 (~2 h of work)

**Implements:** flow.md 1 (permission matrix), 7.5 (cancelled invoices stay listed), 8.2, 8.3; database.md 4.2 (invoice settings, logo).

**Summary:** Four new screens on the APIs from steps 3.4 and 3.5, and their menu items by role:
- **Invoices:** filters for status and "refund needed". Owner, manager, receptionist.
- **Debts:** customers who owe, largest first, each invoice listed. Owner, manager, receptionist.
- **Income:** today and this month, received against invoiced, a branch choice, and refund needed. Owner, manager.
- **Invoice settings:** brand colour, number format with a live example, terms, VAT, and logo upload with a preview. Owner.

**Decisions**
- **Mechanics get no money screens in the menu;** they still open an invoice from its visit (flow.md 1). Pages a role cannot use say so, and the API refuses them anyway.
- **Money is written as `$1,234.50` in both languages,** like the PDF. The `$` is added by hand: Arabic currency formatting prints `US$` even with `narrowSymbol`, so the 3.6 fix had not worked. It was not checked in the browser at the time.
- **Staff read invoice lines in their own language** (user choice 2026-11-03, after testing). An invoice is written in the customer's language, so an English screen showed an Arabic line. `InvoiceDetail.items` gained `serviceName` (English and Arabic, from the line's service type). The screen uses it, while the PDF keeps the customer's language. A custom name (OTHER) shows as typed. No database change.
- **Later, if wanted:** choosing the invoice language per customer. A customer's language belongs to their owner account, so it needs its own plan.

**Files changed**
| File | Change |
|---|---|
| `apps/garage-web/features/invoices/invoice-list.tsx`, `debt-list.tsx`, `income-summary.tsx`, `invoice-settings.tsx` (new) | The four screens |
| `apps/garage-web/app/[locale]/(app)/invoices/page.tsx`, `debts/`, `income/`, `settings/invoices/` (new) | Routes |
| `apps/garage-web/components/pager.tsx`, `roles-only.tsx` (new) | Shared previous/next, and pages for several roles |
| `apps/garage-web/components/app-shell.tsx` | Menu items by role |
| `apps/garage-web/lib/api.ts`, `lib/format.ts`, `messages/*.json` | Logo upload, `$` in Arabic, translations |
| `packages/contracts/src/invoices.ts`, `apps/api/src/invoices/invoices.service.ts`, `apps/garage-web/features/invoices/invoice-status.tsx`, `invoice-page.tsx`, `invoice-forms.tsx`, `apps/api/test/invoice-changes.spec.ts`, `invoice-html.spec.ts` | Line names in the staff's language; 1 test |

**Doc changes:** flow.md 7.2 (invoice page shows line names in the staff's language).

**Problems hit and fixed**
- The number format hint showed raw text: next-intl reads `{BRANCH}` as a placeholder. The braces are now quoted.
- Arabic showed `US$` (see Decisions).
- The income amounts could not shrink on a phone; they now wrap.

**Phase 3 "Done when" (README 6), checked in real Chrome against the test database with real PDFs:**
- **Sequential invoice PDF:** three finishes in a row got numbers N, N+1, N+2, each with a PDF. A changed number format and VAT applied to the next invoice, and a PDF with the logo was read page by page.
- **Partial payments:** a payment of $80 on $200 left $120, on the invoice and in the debt list.
- **Debt list:** right totals per customer, largest first. A fully paid invoice leaves the list.
- **Income:** today grew by exactly what was received and invoiced. A cancel took the invoice out of invoiced, kept the money in received, and added it to refund needed.
- **Roles:** checked in the menu and on the pages.
- **Result:** 30 of 31 checks passed. The other failed on a wrong assumption in the test, not the app: a VAT rate from an earlier run was still saved, so turning VAT on was rightly allowed.

Phase 3 is complete except its last item, the first deployment, which is step 3.8.

**Verified:** by me: 186 API tests, 41 tenancy tests, all other tests, typecheck and lint of everything, `format:check`; the browser checks above (not in the repo, not run in CI). After the `$` and wrap fixes, all four pages were shot again in Arabic and English with no sideways scroll and no `US`. By the user: `npm run dev`, finish, payment, PDF, debts, income, settings and Arabic in the browser (found the Arabic line name, fixed above), then the commit commands. CI green.
**Commit:** `3d77a5f` — `Phase 3.7: invoice list, debt list, income summary and invoice settings screens`

---

## Phase 3 · Step 3.8 — Fix: the first PDF froze the API; deployment moved after Phase 5
**When:** 2026-11-05 (~30 min)

**Summary:** The user's `npm run dev` showed an error when finishing a visit: a visit's transaction "expired" after 10 s, and a notification job could not start a transaction. Nothing was wrong in the database (no lock waits, nothing in its log). The cause: the first PDF after the API starts loads Puppeteer, and loading it is synchronous. On a cold Windows start it took 8.3 s, measured, with the whole API frozen for 8.3 s; the transactions of that moment overran their 5 s limit. Warm, it takes 0.2 s, which is why it was not seen before. The API now loads Puppeteer while it starts, before it takes requests.

**Decisions**
- **The first deployment waits until after Phase 5** (user choice 2026-11-05): with only test users, it waits until the admin side is complete. It will start on Render's free instances and move to paid plans before a real garage uses it. The production code planned for 3.8 (R2 files, Resend email, Chrome on Render, headers, private API, `render.yaml`) moves with it.
- The database roles check on Render moves with it too.

**Files changed**
| File | Change |
|---|---|
| `apps/api/src/invoices/pdf/pdf-renderer.ts` | Loads Puppeteer (and the fonts) at startup |

**Doc changes:** README 6 (deploy after Phase 5, free instances first) and 9 (free-plan limits to check).

**Also seen, not changed:** the same log shows a `pg` warning, "Calling client.query() when the client is already executing a query". It is a warning for now (an error in a future `pg` 9), and our code never runs two queries at once on one transaction. To look at before upgrading `pg`.

**Verified:** by me: measured Puppeteer's load time (8.3 s cold, 0.2 s warm, with the event loop blocked for the cold load); API typecheck and lint; the built API starts normally on the test database with real Puppeteer. By the user: `format:check`, `typecheck`, `npm test`, `test:tenancy`, then the commit.
**Commit:** `441a15e` — `Phase 3.8: load Puppeteer at API start; move the first deployment after Phase 5`

---

## Phase 4 · Step 4.0 — Doc fixes and Phase 4 decisions
**When:** 2026-11-05 (~40 min)

**Summary:** Planning Phase 4 found that no reminder could reach a customer: the customer screens have no email, the in-app channel needs the owner app (Phase 6), and WhatsApp was "later". So every reminder would have been logged as skipped. The user chose how reminders go out, and the docs now describe the phase before any code.

**Decisions (user, 2026-11-05)**
- **Email and a WhatsApp list.** An optional email on the customer is sent automatically. Customers without one (or whose email failed) appear on a "Reminders due" list, where staff open WhatsApp with the message already written and press send, then mark it sent. It is free and needs no WhatsApp business account.
- **The monthly reminder is off by default;** each garage can turn it on.

**Decisions (mine, in the docs for review)**
- The customer's email is kept **per garage** (`garage_customers.email`), not on the shared `owners` row: one garage can neither see nor overwrite another garage's entry. `owners.email` stays for the owner app login.
- The reminder job runs **every hour**, inside each garage's daytime window, instead of once a day at a fixed time: it handles every time zone and catches up after a restart. Dedupe keys make extra runs harmless.
- Each **round** of a reminder is sent once, by email or WhatsApp, never both. Dedupe keys are now `REMINDER:{id}:{round}:{channel}`.
- The `IN_APP` adapter and inbox move to Phase 6, with the owner app that reads them. Nothing would use them before.
- The reminder settings are constants in `contracts` until `system_settings` exists (Phase 5), like the default daily km.
- The Reminders due list: owner, manager, receptionist. The notification log: owner, manager.

**Files changed:** docs only.

**Doc changes:** flow.md 1 (two matrix rows), 3.1 (customer email), 5.2, 9 (rewritten: 9.1 scan, 9.2 monthly, 9.3 rules, 9.4 pipeline, 9.5 WhatsApp list); database.md 4.1 (`owners.email`, `system_settings`), 4.2 (`monthlyReminderEnabled`), 4.3 (`garage_customers.email`), 4.6 (dedupe keys); README 5.5, 6 (Phase 4 list and Done-when, Phase 6).

**Verified:** `format:check` on the docs; checked the docs for other mentions of the daily job, the old dedupe key and the inbox. By the user: `format:check`, then the commit.
**Commit:** `7e382cb` — `Phase 4.0: reminder decisions: customer email, WhatsApp list, monthly off by default`

---

## Phase 4 · Step 4.1 — Database: customer email, monthly reminder setting
**When:** 2026-11-05 (~15 min)

**Implements:** database.md 4.2 (`monthlyReminderEnabled`), 4.3 (`garage_customers.email`); flow.md 9.1, 9.2.

**Summary:** One migration adds two columns: `garage_customers.email` (optional, the garage's own contact email for reminders) and `garage_settings.monthly_reminder_enabled` (default false). Both tables already have their row-level security and grants, so nothing else changes. No index is added: the reminder scan uses the existing `(garageId, status, nextDueDate)` index on `reminders` and the unique dedupe key on `notifications`.

**Files changed**
| File | Change |
|---|---|
| `packages/database/prisma/schema.prisma` | The two columns |
| `packages/database/prisma/migrations/20261105090000_phase4_reminders/migration.sql` (new) | The migration |

**Doc changes:** none (written in step 4.0).

**Verified:** by me: the migration applied to a fresh test database, and `prisma migrate diff` from that database to the schema is empty (the migration and the schema agree); typecheck of everything; 186 API tests, the database tests, and `test:tenancy` (23 guard-rail and 41 endpoint tests). By the user: the migration on the development database, the checks, then the commit.
**Commit:** `6bad3d7` — `Phase 4.1: customer email and monthly reminder setting`

---

## Phase 4 · Step 4.2 — Pipeline: retries, daytime only, stuck rows, fair-use cap
**When:** 2026-11-05 (~1 h 30 min)

**Implements:** flow.md 9.3, 9.4; README 5.5, 9 (emails stuck in `QUEUED`).

**Summary:** The sending pipeline now follows the Phase 4 rules. Nothing calls the reminder parts yet; the reminder scan comes in 4.3.
- **Retries:** a failure that may pass (an adapter marks it `retryable`, or throws) is tried again with exponential backoff, 3 attempts in all, then stored as `FAILED` with the error. While it waits, the row stays `QUEUED` and shows the last error. Any other failure (bad address, invalid template data) is `FAILED` at once.
- **Daytime only:** a reminder (service, monthly, warranty) whose job runs outside 09:00–20:00 in the garage's time zone is put back in the queue until the next 09:00, and the row gets that `scheduledFor`. Invoices, invites and password resets are sent at once.
- **Fair-use cap:** over 2,000 automatic reminder emails this month (garage time zone), a reminder is `SKIPPED` with "Monthly reminder limit reached". A constant in `contracts` until Phase 5.
- **Stuck rows:** `requeueStuck()` queues again a garage's rows still `QUEUED` 10 minutes after they were written (Redis was down at the time). A row whose job still exists keeps it, and a job that crashed on its last attempt is replaced. 4.3's hourly scan will call it.

**Decisions**
- `SendResult` failures gained an optional `retryable` (README 5.5), so a provider outage is retried and a bad address is not.
- The cap counts automatic emails only; messages staff send themselves on WhatsApp cost nothing. Jobs running at the same moment can pass it by a few, which is fine for a fair-use limit.
- Two settings, both with defaults, so `.env` needs nothing new: `NOTIFICATION_RETRY_DELAY_MS` (first wait, 30 s; 20 ms in tests) and `QUEUE_PREFIX` (BullMQ's default `bull`).

**Problems hit and fixed**
- The first run of the new tests failed. API test files run in parallel on one Redis queue, so another file's worker, using the real console channel, took jobs meant for the fake channel. The reverse could make other tests flaky. The new file now uses its own queue prefix (`QUEUE_PREFIX`).
- A delayed reminder that runs after its garage is gone (in tests, the next run's fresh database) now ends quietly instead of failing.

**Files changed**
| File | Change |
|---|---|
| `packages/contracts/src/reminders.ts` (new), `index.ts`, `test/reminders.test.ts` (new) | Daytime window, cap, `nextDaytimeStart` (time zones, summer time); 6 tests |
| `apps/api/src/notifications/notifications.service.ts` | Daytime check, cap, retries, `requeueStuck` |
| `apps/api/src/notifications/notifications.queue.ts` | 3 attempts with backoff, postpone, replace a failed job, prefix |
| `apps/api/src/notifications/notification-channel.ts`, `adapters/console-email.channel.ts` | `retryable`; bad template data is a final failure |
| `apps/api/src/config/env.ts`, `apps/api/src/invoices/pdf/invoice-pdf.queue.ts`, `packages/database/src/test-environment.ts` | The two settings |
| `apps/api/test/notification-rules.spec.ts` (new), `test/helpers/app.ts` | 7 tests with a fake email channel; provider overrides in the test app |

**Doc changes:** README 5.5 (`retryable`).

**Verified:** by me: `format:check`, lint and typecheck of everything, all tests 3 times in a row (193 API tests, 7 new; 6 new `contracts` tests), `test:tenancy` (41). Not covered by a test: replacing a job that crashed on its last attempt (it needs a crash outside the send). By the user: the checks, then the commit.
**Commit:** `851f687` — `Phase 4.2: notification retries, daytime-only reminders, fair-use cap, stuck rows`

---

## Phase 4 · Step 4.3 — Reminder scan job
**When:** 2026-11-05 (~2 h)

**Implements:** flow.md 9.1, 9.2, 9.3; database.md 4.4 (`reminders`), 4.6 (dedupe keys).

**Summary:** A BullMQ job scheduler runs the reminder scan every hour. It skips locked garages (the same lock rule as staff login), and handles each other garage under its own tenant context, so a failure in one garage does not stop the others. For each garage it:
1. Queues again any stuck notification rows (step 4.2), at any hour.
2. Stops there outside 09:00–20:00 in the garage's time zone.
3. Finds the due reminders (`reminderRound`: by estimated km or by date, each with the garage's lead; follow-ups after 30 days, twice at most).
4. Emails the customers the garage has an email for: one row per round, key `REMINDER:{id}:{round}:EMAIL`.
5. Sends the monthly reminder, when the garage turned it on.

When an email is marked `SENT`, the same transaction counts the round on the reminder (`notifyCount`, `lastNotifiedAt`, status `SENT`). Customers without an email, or whose email failed, stay due for the WhatsApp list (step 4.4).

**Decisions**
- **Follow-ups are for service reminders only.** A warranty end or a recommended service is sent once. Written in flow.md 9.1.
- **A sent round counts through a hook.** The notification module calls a handler for its `refType` when a row becomes `SENT`. So notifications do not depend on reminders, and 4.4's "mark as sent on WhatsApp" will count rounds the same way (`countRound`).
- **One scan per hour, wherever the API runs.** Every API process registers the same scheduler, and the worker takes one scan at a time. `REMINDER_SCAN=off` turns it off; tests use that and run scans themselves.
- **Hourly scans stay cheap.** A scan first leaves out dedupe keys already in the log, so it writes nothing for work it already did. The unique key still guards two scans at once.
- **Four new email templates,** in English and Arabic: service reminder, warranty end, recommended service, and monthly. Numbers and dates use Western digits, as on the invoices. Checked by rendering samples.
- **A scan reads all open reminders of a garage.** That is fine at today's sizes; filter in SQL if a garage grows large.

**Files changed**
| File | Change |
|---|---|
| `packages/contracts/src/reminders.ts`, `test/reminders.test.ts` | `reminderRound`, `monthStart`, `localMonth`, follow-up constants; 8 tests |
| `apps/api/src/reminders/*` (new) | Scan scheduler, `RemindersService` (scan, due list, rounds, monthly), module |
| `apps/api/src/notifications/notifications.service.ts` | `onSent` hook, run in the transaction that marks a row `SENT` |
| `apps/api/src/notifications/templates/reminders.ts` (new), `templates/index.ts` | The four templates |
| `apps/api/src/app.module.ts`, `src/config/env.ts`, `packages/database/src/test-environment.ts` | Module; `REMINDER_SCAN` (on by default, off in tests) |
| `apps/api/test/reminders.spec.ts` (new) | 10 tests |

**Doc changes:** flow.md 9.1 (follow-ups for service reminders only; where the rule lives).

**Verified:** by me: `format:check`, lint and typecheck of everything; the 10 new tests cover:
- one email per round, also with three scans at once;
- nothing before due, nothing for an opted-out customer, nothing outside the daytime window;
- no email: nothing sent, still due for the list;
- follow-ups at 30 days, at most 3 rounds;
- servicing the car closes the reminder;
- the warranty template;
- the monthly reminder: off by default, once a month, not after a service reminder.

All tests passed 4 times in a row: 203 API tests, 69 `contracts` tests, and `test:tenancy` (41). Once in those 4 runs, Jest said a test worker "failed to exit gracefully". Every test still passed, and neither new test file leaves anything open when run alone, so its cause is not found. Not covered by a test: `scanAll` skipping locked garages, because a scan of every garage would touch other test files' garages. It uses the same lock rule that is tested for logins. By the user: the checks (the first `npm test` failed because Postgres and Redis had stopped; started again with `npm run db:up`), then the commit.
**Commit:** `fc34b8b` — `Phase 4.3: hourly reminder scan with rounds, follow-ups, warranty and monthly emails`

---

## Phase 4 · Step 4.4 — API: customer email, WhatsApp list, notification log, reminder settings
**When:** 2026-11-09 (~2 h)

**Implements:** flow.md 1 (matrix), 3.1, 9.4, 9.5; database.md 4.2, 4.3, 4.6.

**Summary:** The API the Phase 4 screens need.
- **Customer email:** optional on create and edit, stored lower case; an empty value clears it.
- **Reminders due:** the WhatsApp list. A customer without an email, or whose email of this round failed or was skipped, is listed with a `wa.me` link and the message already written in their language. A customer whose email is waiting or sent is left out, so nobody gets a round twice.
- **Mark as sent:** writes a `WHATSAPP` `SENT` row in the log and counts the round, like a sent email. A second click changes nothing (`counted: false`). A round that is not the next one is `409 REMINDER_NOT_DUE`. Who sent it is in the audit log.
- **Notification log:** newest first, filters for status and channel. Each row says who it was for (customer or staff member), and never includes the content.
- **Reminder settings:** lead km, lead days and the monthly reminder. Owner only.

**Roles (flow.md 1):** the due list and mark-sent are for the owner, managers and receptionists; the log for the owner and managers; the settings for the owner.

**Decisions**
- **One wording, two channels.** The WhatsApp text sits next to the email templates and uses the same due text ("at 55,100 km or on 5 May 2027, whichever comes first"), shorter, ending with "Reply to book it".
- **The list is built from the same rule as the scan** (`dueNow`), then checks this round's email in the log. A follow-up whose earlier round went by email can come to the list if its own email fails.
- **The log shows the recipient's address,** as database.md 4.6 allows, for the owner and managers only.
- **The mark-sent response field is `id`,** so the audit row records the reminder like other audited actions.

**Files changed**
| File | Change |
|---|---|
| `packages/contracts/src/customers.ts`, `reminders.ts`, `errors.ts` | Email field; list, mark-sent, log and settings types; `REMINDER_NOT_DUE` |
| `apps/api/src/customers/customers.service.ts` | Saves and returns the email |
| `apps/api/src/reminders/reminder-list.service.ts`, `reminder-settings.service.ts`, `reminders.controller.ts` (new), `reminders.service.ts`, `reminders.module.ts` | The list, mark-sent, settings; `whatsappUrl`, estimated km on due reminders |
| `apps/api/src/notifications/notification-log.service.ts`, `notifications.controller.ts` (new), `notifications.module.ts` | The log |
| `apps/api/src/notifications/templates/reminders.ts` | `whatsappReminderText`; the due text shared with the email |
| `apps/api/test/reminder-api.spec.ts` (new), `test/tenancy.spec.ts` | 10 tests; 5 tenancy cases |

**Doc changes:** flow.md 3.1 (email in the API), 9.5 (the endpoints), 14 (API surface).

**Verified:** by me: `format:check`, lint and typecheck of everything; all tests twice in a row (218 API tests, 10 new); `test:tenancy` (46, 5 new: A sees only its own due reminders and log, cannot mark B's reminder, and its settings change never reaches B); sample WhatsApp messages rendered in both languages. By the user: the checks, then the commit.
**Commit:** `c1b85ef` — `Phase 4.4: customer email, WhatsApp reminder list, notification log and reminder settings API`

---

## Phase 4 · Step 4.5 — garage-web: email field, Reminders due, messages log, reminder settings (Done-when check)
**When:** 2026-11-09 (~2 h)

**Implements:** flow.md 1 (matrix), 3.1, 9.4, 9.5; README 6 (Phase 4 "Done when").

**Summary:** The Phase 4 screens, on the API of step 4.4.
- **Customer email:** an optional field on the New customer form and on the customer's edit form, shown on the customer page. The hint explains it: with an email, reminders go out by themselves; without one, they come to the WhatsApp list.
- **Reminders due** (owner, manager, receptionist). One card per due reminder: customer, phone, car, service in the screen's language, due km or date, the car's estimated km, and labels ("Reminder", "Follow-up 1", "Email failed"). **Send on WhatsApp** opens WhatsApp with the message ready in the customer's language; **Mark as sent** then becomes the main button, and the card leaves the list.
- **Messages log** (owner, manager). Each message with who it was for, the channel, the address, the time, and a status label (Waiting, Sent, Failed, Skipped). It shows the error when there is one, and when a reminder is waiting for daytime. Filters for status and channel. Never the content.
- **Reminder settings** (owner). Lead km (0–5,000), lead days (0–60), and the monthly reminder switch, with what each does.
- Menu items by role, and text in English and Arabic.

**Decisions**
- **The screen says "Messages log", not "Notification log".** That is plainer for garage staff; the docs and code keep "notification log".
- **No email field in quick entry:** it must stay under 20 seconds (README 5.7). The email is added on the customer's page.

**Problems hit and fixed**
- A card read "due at 50,400 km or due on 9 May 2027". It now says "due at 50,400 km or on 9 May 2027", in Arabic too.
- Script-only problems, not app bugs:
  - The message check expected "km", but the message is in the customer's language (Arabic here, "كم").
  - Typing the lead km added to the old value instead of replacing it.
  - The database check compared `t` with `true`.
  - The Arabic full-page screenshot looked shifted, as in step 3.7. A screen-size screenshot is correct, and the page has no sideways scroll.

**Phase 4 "Done when" (README 6), checked in real Chrome on a phone-size screen against the test database, with the real API, queue and hourly scan job:**
- **Each due car is reached once per round:**
  - Of two due cars, the customer with an email was emailed once (`EMAIL` `SENT`) and the round counted. The customer without one got nothing automatic and was on the WhatsApp list.
  - The WhatsApp link had their phone and the message.
  - Mark as sent took them off the list, logged a `WHATSAPP` `SENT` row and counted the round.
  - Two more scans sent nothing more.
  - When the next round's email failed, that reminder came to the list as "Follow-up 1 · Email failed". The failure was written into the database by the script, because the console email never fails; real failures are covered by the API tests of step 4.2.
- **The log shows sent or failed:** the sent email, the WhatsApp message with the customer's name, and the failed email with its error. The status filter worked.
- **Also checked:**
  - The email field: saved in lower case and shown, and a wrong address refused.
  - Reminder settings saved.
  - Roles in the menu and on the pages: the receptionist has Reminders but not the log; the mechanic has neither.
  - Arabic fits a phone screen.
- **Result:** 25 of 25 checks passed, after fixing the script problems above.

**Phase 4 is complete.**

**Files changed**
| File | Change |
|---|---|
| `apps/garage-web/features/reminders/reminders-due.tsx`, `reminder-settings.tsx`, `features/notifications/notification-log.tsx` (new) | The three screens |
| `apps/garage-web/app/[locale]/(app)/reminders/`, `notifications/`, `settings/reminders/` (new) | Routes |
| `apps/garage-web/features/customers/new-customer-form.tsx`, `customer-page.tsx` | Email field |
| `apps/garage-web/components/app-shell.tsx`, `messages/en.json`, `messages/ar.json` | Menu by role; texts and `REMINDER_NOT_DUE` |

**Doc changes:** none (the screens follow flow.md 9.5 as written in step 4.0).

**Verified:** by me:
- `format:check`, lint and typecheck of everything.
- 218 API tests and `test:tenancy` (46).
- The browser check above. It is not in the repo and does not run in CI.

By the user: stopped the leftover test web server, ran the checks and committed.
**Commit:** `ef070b8` — `Phase 4.5: customer email field, Reminders due with WhatsApp, messages log and reminder settings screens`

---

## Phase 5 · Step 5.0 — Doc fixes and Phase 5 decisions
**When:** 2026-11-09 (~20 min)

**Summary:** Phase 4 is done. The user answered the open Phase 5 questions, and the docs now describe the phase before any code.

**Decisions (user, 2026-11-09)**
- **The public website lives inside `garage-web`:** a landing page with the prices, and an Apply form. There is no separate app, so there is no extra service to host; it can move out later.
- **Prices as written:** $200 a year, +$100 per extra branch, paid in cash or Whish. These are defaults in `system_settings` that the admin can edit (README 7, now confirmed).
- **Monitoring shows simple counts:** emails sent and failed, WhatsApp messages marked sent, last login, customers, cars, invoices. There is no cost estimate while no paid channel exists.
- **Real email waits for the deployment** that follows Phase 5, together with domain setup. The user did not ask to move it earlier.

**Decisions (mine, in the docs for review)**
- **Applications** (flow.md 11.6):
  - The form asks for: garage name, owner name, email, phone, city, number of branches, and a message.
  - It is rate limited per IP and has a hidden honeypot field, with no captcha.
  - Approving opens the create-garage form already filled in, as a trial; Reject needs a reason.
  - It is stored in a new platform table, `garage_applications`.
- **The constants move to `system_settings`:** the reminder daytime window, follow-ups, fair-use cap, default daily km and trial days, with the same values as today.
- **Phase 5 is split into eight steps** (5.0–5.7, in the status table), then the deployment step: free Render instances, Resend email and R2 files.

**Files changed:** docs only.

**Doc changes:** README 6 (Phase 5: website place, simple counts), 7 (price confirmed); flow.md 11.2, 11.4, 11.5, 11.6 (new); database.md 2 (platform tables), 4.1 (`garage_applications`), 5 (`ApplicationStatus`).

**Verified:** `format:check` on the docs. By the user: the commit.
**Commit:** `3030db7` — `Phase 5.0: Phase 5 decisions: website in garage-web, prices, simple monitoring counts`

---

## Phase 5 · Step 5.1 — Database: subscription payments, access logs, system settings, applications
**When:** 2026-11-09 (~30 min)

**Implements:** database.md 2, 4.1 (`subscription_payments`, `admin_access_logs`, `system_settings`, `garage_applications`), 5 (`ApplicationStatus`), 6.1.

**Summary:** One migration adds the four platform tables of Phase 5 and the `ApplicationStatus` enum.
- **Rights:**
  - Payments and access logs are append-only, even for `gearva_platform`, which may read and add rows but never change or delete one.
  - Settings and applications: `gearva_platform` may read, add and change rows, never delete.
  - `gearva_app` may only read `system_settings`; it has no right on the other three.
- **Checks:**
  - A payment is above 0, with 0 or more extra branches, and a new expiry date not before the period start.
  - An application has 1 to 50 branches; an approved one points at its garage, and a rejected one has a reason.

**Decisions**
- **Row-level security as a second guard.** Three of the tables carry a `garage_id`, so they also get the tenant policy and are listed in `tenant-tables.ts`. The guard-rail test requires that of every table with that column. The garage app still has no grant on them.
- **The setting defaults are seeded in 5.3,** the step that first reads them (database.md 9: "added with the phases that read them").

**Files changed**
| File | Change |
|---|---|
| `packages/database/prisma/schema.prisma` | Four models, the enum, relations |
| `packages/database/prisma/migrations/20261109100000_phase5_admin/migration.sql` (new) | Tables, checks, grants, RLS |
| `packages/database/src/tenant-tables.ts` | The three tables with a `garage_id` |
| `packages/database/test/rls.test.ts` | 2 tests: `gearva_app` rights, append-only tables |

**Doc changes:** database.md 2 (the exception for these three tables), 4.1 (rights and checks of each table).

**Verified:** by me:
- The migration applied to a fresh test database, and `prisma migrate diff` from it to the schema is empty.
- 25 database tests (2 new), 218 API tests, `test:tenancy` (46).
- `format:check`, lint and typecheck of everything.

By the user: the migration on the development database, the checks, then the commit.
**Commit:** `1961183` — `Phase 5.1: subscription payments, admin access logs, system settings and garage applications tables`

---

## Phase 5 · Step 5.2 — API: subscription lifecycle
**When:** 2026-11-09 (~1 h 30 min)

**Implements:** flow.md 2.5, 11.1; database.md 4.1 (`subscription_payments`).

**Summary:**
- **Record a payment** (`POST /admin/v1/garages/:garageId/payments`): amount, method (cash or Whish), payment date, new expiry date, extra branches, note. The garage becomes paid and `ACTIVE` until the end of the new expiry date, at once. Its staff's existing sessions work again without signing in.
- **Extend a trial** (`POST .../extend-trial`): for a garage that has never paid, to a later day, also after the trial ended.
- **The garage detail** lists its payments, newest first, with who recorded each, and suggests the next expiry date: 12 months after the current paid period, or after today.
- **An hourly job** marks `EXPIRED` the garages whose paid period or unpaid trial ended. Access never waits for it: the lock guard checks the dates on every request.

**Decisions**
- **A renewal continues the paid period.** It starts where the current one ends if that has not passed yet, else on the payment day; trial days are not added (flow.md 11.1).
- **A payment does not lift a suspension;** Reactivate does.
- **A trial is never shortened** by "extend". It cannot be extended once the garage has paid (`409 GARAGE_NOT_IN_TRIAL`).
- **Each change locks the garage row,** so two admins recording at once cannot overwrite each other.
- **Hourly, not daily,** with the same scheduler as the reminder scan. The scheduler became a shared class (`common/jobs/scheduled-job.ts`), and its switch was renamed `REMINDER_SCAN` → `SCHEDULED_JOBS` (on by default, off in tests).

**Problems hit and fixed**
- **A real bug the new job would have caused:** an unpaid trial marked `EXPIRED` would show staff the lock screen for an expired subscription instead of "trial ended". The lock rule now gives `trial_ended` for it; 1 test.
- **A test run failed once** (1 of 227) and did not fail again in 4 runs. The likely cause: the new tests ran the expiry job over every garage in the test database, while other test files, running at the same time, check their own garages' status. The job now takes an optional list of garages, and the tests pass only their own; three full runs in a row then passed.

**Files changed**
| File | Change |
|---|---|
| `packages/contracts/src/garages.ts`, `errors.ts`, `test/garages.test.ts` (new) | Payment and trial schemas, `suggestNewExpiry`, `GARAGE_NOT_IN_TRIAL`; 3 tests |
| `apps/api/src/admin/garages/admin-subscriptions.service.ts` (new), `admin-garages.controller.ts`, `admin-garages.service.ts`, `admin/admin.module.ts` | Payments, trial extension, payments in the detail |
| `apps/api/src/subscriptions/*` (new), `app.module.ts` | The hourly expiry job |
| `apps/api/src/common/jobs/scheduled-job.ts` (new), `reminders/reminders.module.ts`, `reminders.service.ts`, `reminders/reminder-scan.queue.ts` (removed) | Shared scheduler |
| `apps/api/src/common/garage-lock.ts`, `test/garage-lock.spec.ts` | `trial_ended` for an expired trial; 1 test |
| `apps/api/src/config/env.ts`, `packages/database/src/test-environment.ts` | `SCHEDULED_JOBS` |
| `apps/api/test/admin-subscriptions.spec.ts` (new) | 9 tests |

**Doc changes:** flow.md 2.5 (hourly job, the lock reason), 11.1 (payment and trial rules, endpoints).

**Verified:** by me:
- The 9 new API tests cover:
  - a trial becoming paid;
  - a renewal continuing the period, and a date inside it refused;
  - an expired garage's own staff session locked, then working again right after the payment;
  - a suspended garage staying suspended;
  - bad amounts, methods and dates refused;
  - the audit row;
  - trial extension, and its refusal after a payment;
  - the expiry job marking only what it should.
- 3 new `contracts` tests.
- All tests 3 times in a row (228 API tests), `test:tenancy` (46), `format:check`, lint and typecheck.
- The intermittent "worker failed to exit gracefully" warning of step 4.3 showed once more, with every test passing.

By the user: the checks, then the commit.
**Commit:** `26da975` — `Phase 5.2: subscription payments, trial extension and hourly garage expiry`

---

## Phase 5 · Step 5.3 — API: system settings and default service types
**When:** 2026-11-09 (~2 h)

**Implements:** flow.md 11.4; database.md 4.1 (`system_settings`), 4.4 (`service_types`), 9 item 3; README 7.

**Summary:** The values fixed in code until now are settings the admin edits, with the same defaults:
- trial days (30);
- yearly price ($200) and extra-branch price ($100);
- reminder daytime window (09:00–20:00);
- follow-ups (2) and the days between them (30);
- monthly reminder cap per garage (2,000);
- default daily km (35).

Every admin reads them (`GET /admin/v1/settings`); only a super admin changes them (`PATCH`). They now apply where the constants did:
- trial length of a new garage;
- the reminder scan and delivery (window, follow-ups, cap);
- every km estimate (quick entry pre-fill, car page, reminders).

The **default service types** can be listed, with how many garages override each. A super admin can add a type (it can start hidden), and edit names, intervals, order, or hide it.

**Decisions**
- **Super admins only for changes:** prices, reminder rules and default types affect every garage. Every change is audit logged.
- **No seeded rows.** The defaults live in `contracts`, and a row exists only once an admin changed a value, so the seed and the code cannot disagree. Updated in database.md 9.
- **Each API process keeps the settings for a minute,** so a change reaches every process within a minute. A missing or bad stored value falls back to its default, and never stops the app.
- **Code stays the source of the defaults.** The constants remain in `contracts` as defaults, and the helpers take the setting as an input (`nextDaytimeStart`, `reminderRound`, `estimateCurrentKm`).
- **A default type's code never changes,** and records already saved keep their due values.

**Problems hit and fixed**
- The edit schema for a service type was built from the create schema, whose defaults (order 0, offered) would have been applied to every edit: changing only a name would have also reset its order and shown a hidden type to garages. It is now built without defaults, so a field left out stays unchanged. Checked by parsing it.
- Settings and default types are shared by test files running at the same time; one test expects the exact list of service types. So the tests change only the prices (nothing else reads them yet) and put them back. The new type is created hidden. The effects of trial days and daily km are checked in a second test app with a stubbed settings service.

**Not changed yet:** the admin web garage form still shows "30 days" from the constant; its screens come in 5.7 and will read the settings.

**Files changed**
| File | Change |
|---|---|
| `packages/contracts/src/system-settings.ts` (new), `index.ts`, `reminders.ts`, `odometer.ts`, `errors.ts`, `test/system-settings.test.ts` (new) | Settings schema, keys, defaults, reading; settings as inputs; service type schemas; `SERVICE_TYPE_CODE_EXISTS`; 4 tests |
| `apps/api/src/system-settings/*` (new), `app.module.ts` | The cached settings service |
| `apps/api/src/admin/settings/*` (new), `admin/admin-roles.ts` (new), `admin/admin.module.ts` | Settings and default service type endpoints; super admin check |
| `apps/api/src/notifications/notifications.service.ts`, `reminders/reminders.service.ts`, `maintenance/records.service.ts`, `vehicles/vehicles.service.ts`, `admin/garages/admin-garages.service.ts` | Read the settings |
| `apps/api/test/admin-settings.spec.ts` (new), `test/helpers/admin.ts` | 8 tests; super admin sign-in |

**Doc changes:** flow.md 11.4 (what is a setting, who changes it, the endpoints); database.md 9 item 3 (no seeded rows); README 7 (fair-use cap).

**Verified:** by me:
- The 8 new API tests cover:
  - reading the settings, and changing them as super admin but not as admin;
  - values stored and audit logged;
  - bad values refused, also a window ending before the stored start;
  - trial days and daily km applied;
  - default types listed with override counts, added, edited (fields left out unchanged), duplicate code refused, a garage's own type not reachable.
- 4 new `contracts` tests.
- All tests twice (236 API tests), `test:tenancy` (46), `format:check`, lint and typecheck.
- The intermittent "worker failed to exit gracefully" warning showed once, with every test passing.

By the user: the checks, then the commit.
**Commit:** `6edff6d` — `Phase 5.3: system settings and default service types, editable by super admins`

---

## Phase 5 · Step 5.4 — API: monitoring lists, usage counts, business view
**When:** 2026-11-09 (~1 h 30 min)

**Implements:** flow.md 11.2, 11.5, 12.

**Summary:** Read-only views for every admin:
- **Expiring soon:** paid periods ending within 3 weeks and trials ending within 7 days, soonest first, each with its counts.
- **Usage per garage:** paginated, with filters for name, status, paid, and inactive for N days. Per garage:
  - branches, customers, cars, invoices this month;
  - this month's emails sent and failed, and WhatsApp messages marked sent;
  - last sign-in and last visit.
- **Failed messages:** which garage, which kind, which channel, and why.
- **Business view:**
  - revenue, payments and new garages for each of the last 12 months;
  - this year's and last year's revenue, and this year's revenue by payment method;
  - garages per status, and how many have ever paid.

**Decisions**
- **Counts only, never customer data:** no names, recipients or message content, not even in the failure list (flow.md 12). Only counts and the garage's own account data are read, so no admin access log row is needed; those come with "view as garage" in 5.5.
- **"Inactive" means no sign-in and no visit.** Sessions last 30 days, so a garage working every day may not sign in for weeks; the last visit shows real use. Written in flow.md 11.2.
- **Months are calendar months in UTC,** for the whole platform. A garage's own screens use its time zone.
- **Few queries:** the counts for a page of garages come from a few grouped queries, not one per garage.
- **A name filter on the usage list,** useful for the admin, and it lets tests find their own garages while other test files run.

**Files changed**
| File | Change |
|---|---|
| `packages/contracts/src/monitoring.ts` (new), `index.ts` | Query schemas and response types |
| `apps/api/src/admin/monitoring/*` (new), `admin/admin.module.ts` | The four endpoints |
| `apps/api/test/admin-monitoring.spec.ts` (new) | 7 tests |

**Doc changes:** flow.md 11.2 (inactive, endpoints), 11.5 (business view endpoint).

**Verified:** by me:
- The 7 new tests cover:
  - sign-in needed;
  - expiring paid and trial garages, soonest first, and a wider window;
  - the counts of a garage with real customers, cars, visits, invoices and messages, without customer names;
  - an idle garage found as inactive, while one that signs in rarely but records visits is not;
  - the status and paid filters;
  - failures with the reason and without the recipient;
  - business totals growing by a recorded payment.
- All tests twice (243 API tests), `test:tenancy` (46), `format:check`, lint and typecheck.

By the user: the checks, then the commit.
**Commit:** `aa95926` — `Phase 5.4: admin monitoring lists, usage counts and business view`

---

## Phase 5 · Step 5.5 — View as garage
**When:** 2026-11-09 (~2 h 30 min)

**Implements:** flow.md 11.3, 12; database.md 4.1 (`admin_access_logs`, `sessions`).

**Summary:** An admin can open a garage's own app, read only, for support:
1. **The link:** `POST /admin/v1/garages/:garageId/view-as` gives a link to garage-web's `/view-as` page, with a one-time code after `#`. The code works once, for 2 minutes; only its hash is kept, in Redis.
2. **The session:** garage-web trades the code for a 1-hour session of the admin in that garage, never refreshed. The screens are the owner's, with a banner ("You are viewing … as a Gearva admin. Read only; every page you open is logged.") and a **Leave** button.
3. **Read only:** every request that is not a read is refused with `403 VIEW_ONLY`.
4. **Logs:** the start, every page of data opened (its path, never the data), and Leave go to `admin_access_logs`. The garage's own audit log shows the views under the admin.

**Decisions**
- **The real garage screens,** not copies in the admin app: support sees exactly what the garage sees, and nothing has to be built twice.
- **The code goes after `#`:** browsers never send it to a server, so it stays out of every log; garage-web's locale redirect keeps it (checked in Chrome).
- **A locked garage can be viewed,** since an expired or suspended garage is often the one needing help.
- **No support actions yet:** everything that changes data is refused. flow.md 11.3 allows adding specific ones later, audit logged.
- **A session that runs out has no end row;** its last viewed page shows when the visit ended. Written in flow.md.
- **A new nullable column, `sessions.viewAsGarageId`,** with a check that only an admin session can have it. The guard reads the garage from the session, never from the request.

**Problems hit and fixed**
- **An existing race in the tenancy suite,** seen once in two full runs: garage B's invoice PDF is made by a background job. When it finished during the first test, the "B unchanged" check saw the new PDF. The setup now waits for both garages' PDFs; three full runs in a row then passed.
- **Found by the user's test run:** every view-as start logged "Audit write failed" (foreign key on `audit_logs.garage_id`). The endpoint's audit entity was "garage", so the interceptor took the response's `id` as the garage, but the response is the admin's profile. The visit worked, but its audit row was lost, and no test failed, because a failed audit write is only logged. The entity is now the admin, and the row takes the viewed garage from the session. A test now checks the row exists, and a full run has no "Audit write failed" line.
- The garage-web page first set state inside an effect (lint error). It now uses a mutation, and sends the one-time code only once even when React runs effects twice.

**Files changed**
| File | Change |
|---|---|
| `packages/database/prisma/schema.prisma`, `migrations/20261110090000_view_as_sessions/migration.sql` (new) | `sessions.viewAsGarageId` and its check |
| `packages/contracts/src/staff.ts`, `garages.ts`, `errors.ts` | `viewOnly`, `viewAsSchema`, `ViewAsLink`, `VIEW_ONLY` |
| `apps/api/src/auth/view-as.service.ts` (new), `session.service.ts`, `staff.guard.ts`, `staff-auth.controller.ts`, `staff-auth.service.ts`, `cookies.ts`, `auth.module.ts` | Codes, sessions, the read-only guard, logs, Leave |
| `apps/api/src/admin/garages/admin-garages.controller.ts` | The link |
| `apps/garage-web/app/[locale]/view-as/page.tsx`, `features/auth/view-as-entry.tsx` (new), `components/app-shell.tsx`, `messages/*.json` | The entry page, the banner, texts |
| `apps/api/test/view-as.spec.ts` (new), `test/tenancy.spec.ts` | 8 tests; the new public route; the PDF wait |

**Doc changes:** flow.md 11.3 (how it works); database.md 4.1 (`sessions.viewAsGarageId`).

**Verified:** by me:
- The 8 new tests cover:
  - only a signed-in admin gets a link;
  - the session is a read-only owner, and its start is logged;
  - only that garage's records are read, and each view is logged, also in the garage's audit log;
  - every change refused, with nothing written;
  - a code works once, and a session of another garage sees none of this one;
  - a suspended garage can be viewed;
  - no refresh, and Leave ends the visit with a row;
  - a deactivated admin is cut off.
- Real Chrome against a throwaway stack: the link without a locale opens the garage through the redirect, with the banner, and the code is gone from the address bar; a change is refused with `VIEW_ONLY`; pages opened are logged; the same link again is refused; Leave ends the visit and logs it.
- All tests 3 times in a row (251 API tests), `test:tenancy` (46), `format:check`, lint and typecheck; after the audit fix, a full run with 0 "Audit write failed" lines.

By the user: the first `npm test` run (all passed, but showed the audit errors above); after the fix, the commit commands.
**Commit:** `133db7f` — `Phase 5.5: view as garage, read only, with access logs`

---

## Phase 5 · Step 5.6 — Applications and the public website
**When:** 2026-11-10 (~2 h)

**Implements:** flow.md 11.6; database.md 4.1 (`garage_applications`, `system_settings`); README 6 (Phase 5: website inside garage-web).

**Summary:** Garages can now ask to join, and admins can review them through the API:
1. **The website:** `/welcome` in garage-web shows what Gearva does, the prices from the system settings ($200 a year, $100 per extra branch, the free trial days), and the Apply form. A visitor opening `/` lands there. The sign-in page links to it.
2. **Apply:** garage name, owner, email, phone, city or area, branches, and an optional message. The visitor only sees "we will contact you". It is limited to 5 an hour per IP and has a hidden honeypot field.
3. **Admin API:** a list with new applications first; a detail with earlier applications from the same email or phone; approve, which creates the garage and its owner invite from the filled-in create form; and reject, with a reason. The admin screens come in 5.7.

**Decisions**
- **One landing page,** with the form at its end, as in the design prototype, instead of separate pages.
- **The website claims only what exists now:** reminders by email and WhatsApp. No mobile app and no offers until Phases 6 and 7.
- **Approve takes the create-garage form,** so the admin can correct what the visitor typed. The garage and the application's mark are saved in one transaction.
- **No migration:** the table has existed since 5.1.

**Problems hit and fixed**
- **One full test run** had the tenancy suite's setup time out (30 s), while my browser-check servers (API and Next dev) were running on the same machine. With them stopped, two full runs in a row passed. The setup waits for two invoice PDFs, so it is sensitive to CPU load. Not changed; worth remembering if it happens in CI.

**Files changed**
| File | Change |
|---|---|
| `packages/contracts/src/applications.ts` (new), `index.ts`, `errors.ts` | `applySchema`, `PublicPricing`, list, reject and detail types, `APPLICATION_ALREADY_REVIEWED` |
| `apps/api/src/applications/*` (new), `app.module.ts` | Public pricing and Apply (rate limit, honeypot) |
| `apps/api/src/admin/applications/*` (new), `admin.module.ts` | List, detail, approve, reject |
| `apps/api/src/admin/garages/admin-garages.service.ts` | `create` takes a step to run in its transaction |
| `apps/garage-web/app/[locale]/welcome/page.tsx`, `features/website/*` (new) | The landing page and the Apply form |
| `apps/garage-web/components/app-shell.tsx`, `features/auth/login-form.tsx`, `lib/format.ts`, `messages/*.json` | `/` to the website when signed out, the Apply link, whole-dollar prices, texts (English and Arabic) |
| `apps/api/test/applications.spec.ts` (new), `test/tenancy.spec.ts` | 11 tests; the two public routes |

**Doc changes:** flow.md 11.6 (how it works).

**Verified:** by me:
- The 11 new tests cover:
  - the prices come from the settings;
  - an application is stored as NEW, with no account;
  - the honeypot stores nothing;
  - the form checks, and admin-only review;
  - new first, with filters, and earlier applications;
  - approve creates the garage, its invite and the audit row, once only;
  - a failed creation leaves the application NEW;
  - two approvals at once create one garage;
  - reject needs a reason and is final.
- Real Chrome against a throwaway stack (12 of 12 checks):
  - `/` goes to the website with the real prices, and other pages still go to sign in;
  - field errors show, the honeypot is out of sight, and sending stores one NEW row with the phone in E.164;
  - Arabic is right to left, with no sideways scroll at phone width.
- All API tests twice in a row (262), `test:tenancy` (46), `format:check`, lint and typecheck.

By the user: the commit commands.
**Commit:** `82f1ce8` — `Phase 5.6: applications and the public website`

---

## Phase 5 · Fix — `db:reset` on the development database
**When:** 2026-11-10 (~30 min)

**Summary:** The user's `npm run dev` logged a reminder scan error per garage every hour, and old test emails. The cause was data left in the development database from 19 to 22 October, before tests had their own database (step 1.7): 115 `[test]` garages, 48 of them without a settings row. The old test invites still waiting were "sent" (console only) once, at startup.

The cure, `npm run db:reset`, failed. It ran `prisma migrate reset`, which dropped the `public` schema and then could not create it again: `gearva_migrator` owns the schema but has no CREATE right on the database. It also would not restore the app roles' USAGE grant on the schema. It had been broken since the roles were split in Phase 1, and left the development database empty this time.

**Fix:**
- `db:reset` is now `reset-dev-db.ts`. It runs only against a local host, and checks the CREATE right before it drops anything. Without the right it prints the one-time grant command and changes nothing. It then drops and recreates the schema, restores the grant, applies the migrations and seeds.
- `docker-init.sh` gives that right on new volumes.

**Files changed**
| File | Change |
|---|---|
| `packages/database/src/scripts/reset-dev-db.ts` (new), `package.json` | The reset |
| `packages/database/sql/docker-init.sh` | CREATE on the database for the migrator (local only) |
| `README.md` | Section 4: what `db:reset` does and needs |

**Doc changes:** README section 4 (scripts).

**Verified:** by me: on the user's database (no grant yet) it refuses and changes nothing; typecheck, lint and format. By the user: the grant, then `npm run db:reset`.
**Commit:** `830d874` — `Phase 5.6: applications and the public website; fix db:reset`

---

## Phase 5 · Step 5.7 — Admin screens, and the Phase 5 "Done when" check
**When:** 2026-11-10 (~3 h)

**Implements:** flow.md 11.1 to 11.6; README 6 (Phase 5 "Done when").

**Summary:** The admin app now has a screen for everything Phase 5 added to the API:
1. **Garage page:**
   - A **Subscription** card lists the payments and records a new one. The amount is filled in from the prices in the settings, and the new expiry from the suggested date.
   - **Extend trial** shows only for a garage that has never paid.
   - **View as garage** gets a one-time link that opens the garage's app, read only.
2. **Applications** (new menu item):
   - The list, new first, with search and a status filter.
   - The detail page shows the earlier applications from the same email or phone, and rejects with a reason.
   - **Approve** opens the new-garage form, filled in from the application; creating the garage approves it.
3. **Monitoring:** three tabs:
   - garages expiring soon (paid and trials);
   - usage per garage, with filters for status, paid and inactive days;
   - failed messages.
4. **Business:** revenue this year and last year, by method; garages that have paid and by status; and the last 12 months.
5. **Settings:** the platform settings and the default service types (add, edit, hide). Super admins edit; other admins only read, as the API already enforces.
6. **The new-garage form** shows the trial length from the settings, not the old fixed 30 days.

**Decisions**
- **The view-as link is fetched, then clicked.** A tab opened after a request is blocked as a pop-up, and the link works for 2 minutes anyway.
- **End dates are shown as the UTC calendar day.** Access ends at the end of that day in UTC, which is already the next morning in Beirut. Shown in local time, "paid until" was one day late. This had been so since Phase 1 in the garage list and page, and is fixed everywhere.
- **The money helpers moved to contracts.** `centsToDecimal` and `dollarsToCents` are now shared by both apps; garage-web re-exports them, so its imports did not change. `addDays` is new next to `addMonths`.

**Problems hit and fixed**
- **The success message after a payment named the wrong date:** the next suggestion (2028) instead of the new expiry. Seen in a screenshot, fixed, and now checked in the browser.
- **The garage page scrolled sideways on a phone:** the grid column grew to fit the payments table. `grid-cols-1` lets the column shrink, so the table scrolls inside its own frame.
- **A browser-check run stopped on the website:** the Apply rate limit (5 an hour per address) had blocked it, as designed. I cleared the test stack's counters.

**Files changed**
| File | Change |
|---|---|
| `apps/admin/features/garages/subscription-card.tsx`, `view-as-card.tsx` (new), `garage-detail.tsx`, `garage-list.tsx`, `garage-form.tsx` | Payments, trial, view as garage; end dates; the form reused for approvals, with the trial days from the settings |
| `apps/admin/features/applications/*` (new) | List, detail with reject, approve |
| `apps/admin/features/monitoring/monitoring-page.tsx`, `business/business-page.tsx` (new) | Monitoring tabs, business view |
| `apps/admin/features/settings/*` (new) | Settings form, default service types, the settings query |
| `apps/admin/app/[locale]/(panel)/{applications,monitoring,business,settings}/**` (new), `components/panel-shell.tsx` | Pages and menu |
| `apps/admin/components/pager.tsx`, `table.tsx`, `lib/format.ts` (new), `lib/api.ts` | Shared list pieces, money and date formats, `apiPatch` |
| `apps/admin/messages/*.json` | Texts (English and Arabic), and three error codes |
| `packages/contracts/src/money.ts`, `next-due.ts`, `garages.ts`; `test/money.test.ts`, `test/next-due.test.ts` | Money helpers moved here, `addDays`, tests; the `TRIAL_DAYS` comment |
| `apps/garage-web/lib/format.ts` | Re-exports the moved helpers |

**Doc changes:** flow.md 11.1 (end dates shown as the UTC day; what the payment form fills in).

**Verified:** by me:
- **The Phase 5 "Done when" in real Chrome,** in Beirut time, against a throwaway stack: 26 of 26 checks.
  - Two visitors apply on the website. The admin rejects one with a reason, and approves the other through the filled-in form, with a trial of the settings' length; the owner invite is queued.
  - The trial is extended a week. A payment at the settings' price makes the garage active and paid for a year, shown as the right day.
  - View as garage opens its app read only. Suspend and reactivate work.
  - Monitoring finds the garage; the business view shows the revenue; a super admin changes the price, and the service types are listed.
  - Five admin pages in Arabic fit a phone without sideways scrolling.
  - Nothing was changed in the database by hand: it was only read, to check each step.
- All tests: 262 API, 46 tenancy, contracts (79) and database. `format:check`, lint and typecheck.
- **Not in the browser:** a trial ending turns the garage `EXPIRED` through the hourly job (tested in step 5.2).

**Phase 5 "Done when" — the admin can run the whole subscription lifecycle without touching the database:** met.

By the user: stop the two leftover test web servers (ports 3100 and 3101), then the commit commands.
**Commit:** `72deedd`

---

## Deploy · Step D.1 — Code ready for hosting at gearva.online
**When:** 2026-11-11 (~2.5 h)

**Implements:** README 9 (Deployment on Render); database.md 6.1 (roles, the managed-Postgres fallback); README 5.5 (email adapter) and 3 (files).

**Summary:** Everything the code needs to run on Render at **gearva.online**. The user creates the accounts and services next, following `docs/deploy.md`.
1. **`render.yaml` (Blueprint), all on free plans in Frankfurt:**
   - `gearva-api` at `api.gearva.online`, `gearva-garage-web` at `gearva.online` (website and garage app), `gearva-admin` at `admin.gearva.online`;
   - Postgres 17 `gearva-db`, and Key Value `gearva-redis` (`noeviction`, internal only);
   - the environment group `gearva-shared`. Render generates the secrets; the rest is typed in once.
2. **The API starts the Render way:** `start:render` runs `prisma migrate deploy`, then the seed, then the API. The free plan has no pre-deploy command and no shell.
3. **Real email:** `EMAIL_ADAPTER=resend` sends through Resend's HTTP API with `fetch` (no SDK). A rate limit or a Resend outage is retried; a refused email is final.
4. **Files in R2:** `FILES_ADAPTER=s3` (`@aws-sdk/client-s3`, path-style URLs). Render's disk is wiped on every deploy and every spin-down.
5. **Visitor IPs:** both web apps' `proxy.ts` now also handle the forwarded API paths.
   - They send the visitor's address (`cf-connecting-ip`, or else the last `X-Forwarded-For` entry) with the shared `PROXY_SECRET`.
   - The API uses it only with the right secret, so rate limits, sessions and audit rows get the visitor's IP, and nobody can choose their own.
   - `PROXY_SECRET` is required in production.
6. **Security headers** on both web apps: `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, HSTS, and no `X-Powered-By`.
7. **Database on Render:**
   - `npm run bootstrap:render -w @gearva/database -- "<External URL>"`, run from the user's computer, creates the three roles with random passwords and prints the API's three connection URLs (internal host).
   - The new migration `platform_access_policies` gives `gearva_platform` an explicit policy on every table with RLS, so it works without `BYPASSRLS`, which managed hosts may refuse.

**Decisions**
- **The garage app lives on the bare domain** `gearva.online`, not `app.gearva.online`, because the website is part of it (step 5.6). Render redirects `www` there. The docs and email links follow.
- **The platform policies are always there,** not added only if Render refuses `BYPASSRLS`. One design either way, tested both ways, and no second round trip during the deployment.
- **Region Frankfurt:** the closest Render region to Lebanon.
- **Empty optional settings count as unset** (`S3_ENDPOINT=` in `.env` is not an invalid URL).

**Problems hit and fixed**
- **The first full test run failed in 20 files:** `S3_ENDPOINT=` (empty, from `.env`) was read as an invalid URL. Fixed with the empty-means-unset rule.
- **MinIO's image is no longer on Docker Hub** (pull access denied). The storage check used Adobe's S3Mock instead.

**Files changed**
| File | Change |
|---|---|
| `render.yaml` (new) | The Blueprint |
| `docs/deploy.md` (new) | The user's step-by-step list |
| `apps/api/src/config/env.ts` | `resend`, `s3`, `RESEND_API_KEY`, `S3_*`, `PROXY_SECRET`; required together; empty means unset |
| `apps/api/src/notifications/adapters/resend-email.channel.ts` (new), `notifications.module.ts` | The Resend adapter, picked by `EMAIL_ADAPTER` |
| `apps/api/src/files/file-storage.ts`, `files.module.ts` | `S3FileStorage`, picked by `FILES_ADAPTER` |
| `apps/api/src/app.setup.ts` | Trusts the forwarded visitor IP only with the secret |
| `apps/api/package.json`, `package-lock.json` | `@aws-sdk/client-s3`; the `start:render` script |
| `apps/api/test/deploy-adapters.spec.ts` (new) | Resend adapter and IP forwarding tests |
| `apps/{garage-web,admin}/proxy.ts`, `lib/forward-api.ts` (new), `next.config.ts` | Visitor IP to the API; security headers |
| `packages/database/prisma/migrations/20261111090000_platform_access_policies/` (new) | `platform_access` on all 23 tables with RLS |
| `packages/database/src/tenant-tables.ts`, `test/rls.test.ts` | The generator adds the policy; a test fails if a table with RLS lacks it |
| `packages/database/src/scripts/bootstrap-render-db.ts` (new), `package.json` | `bootstrap:render` |
| `apps/api/src/auth/cookies.ts`, `.env.example` | Comment; the new settings |

**Doc changes:**
- README 9 rewritten: services, how it deploys, free-plan limits, the decisions above. The repository tree, the environment list and the cost line are updated.
- database.md 6.1: `bootstrap:render`, and the platform policies now in place.
- flow.md 1: links on `gearva.online`.

**Verified:** by me:
- **The whole test suite with `gearva_platform NOBYPASSRLS`:** 262 API, 46 tenancy, database and contracts. Then again with the role restored, plus the 6 new tests. Typecheck and lint pass.
- **A Render-like database:** a throwaway Postgres 17 whose admin user has only `CREATEROLE`, like Render's.
  - `bootstrap:render` created the roles (BYPASSRLS refused, fallback used) and handed the schema to the migrator.
  - `start:render`, with `NODE_ENV=production`, applied all 8 migrations, seeded the super-admin and 11 service types, and started the API (`/health` ok).
- **The production builds of both web apps against that API:**
  - An admin login through the admin app stored the visitor IP from `cf-connecting-ip`, and ignored a forged `x-gearva-client-ip`.
  - The same forged header sent straight to the API was ignored.
  - A garage-web login went through its forwarding.
  - All the security headers are present.
- **R2 code:** a put and get round trip against S3Mock; a missing file comes back as none.
- **Not checked yet (needs the real services):**
  - Resend actually delivering;
  - Chrome starting on Render;
  - Render's real header for the visitor IP;
  - the Blueprint itself.

  These are Part F of `docs/deploy.md`.

By the user: the commit commands, then `docs/deploy.md`.
**Commit:** _(filled in at the next step)_

---
