# Gearva — Keep you moving

Gearva is a multi-tenant SaaS for car garages. Garages record services and invoices; the system calculates the next service, reminds customers, and gives the platform owner a control panel for subscriptions.

This repository is the single monorepo for everything. **Read this file first, then `flow.md` (how the system behaves) and `database.md` (the data model).** Together they are the source of truth. If code and docs disagree, fix one of them in the same commit.

---

## 1. The three products

| # | Product | Users | Where | Purpose |
|---|---|---|---|---|
| V1 | **Garage System** (`garage-web`) | Garage owner, manager, mechanic, receptionist | Responsive web (phone + laptop), Arabic/English, RTL | Customers, vehicles, quick service entry, invoices, payments, reminders, offers |
| V2 | **Admin System** (`admin`) | The platform owner (super-admin) + optional admins | Web, separate domain, optional 2FA, Arabic/English | Create garage accounts, subscriptions, usage monitoring, system settings |
| V3 | **Owner App** (`mobile`) | Car owners (garage customers) | React Native (Expo) | See cars, service history, invoices, offers, notifications. Login by phone number |

One backend (`api`) serves all three.

**Core promise:** a garage only ever sees its own customers. Tenant isolation is the most important rule in the whole system.

---

## 2. Tech stack

TypeScript everywhere. Use the current stable major version of each tool, and check its docs before installing, **except where this table pins a major version**. A pin is there because something else in the stack does not support the newer major yet; re-check the reason before upgrading.

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js LTS (22 or 24) | |
| Language | **TypeScript 5.9** (pinned) | TS 6/7 not yet supported by `typescript-eslint` and the Nest 11 CLI |
| Package manager | **npm** (workspaces) | Commit `package-lock.json`. Use `npm ci` in CI and Docker |
| Monorepo tooling | **Turborepo** | Task caching and ordering |
| Backend | **NestJS 11** (pinned) | Modular, guards, interceptors. Nest 12 is ESM-only and `nestjs-zod` supports only Nest 10/11 |
| Validation | **Zod** (schemas live in `packages/contracts`), via `nestjs-zod` | One schema validates API input and web forms |
| Database | **PostgreSQL 16+** | Row-Level Security for tenant isolation |
| ORM | **Prisma 7** | Prisma 7 needs `prisma.config.ts` and a driver adapter (`@prisma/adapter-pg`). Follow the Prisma docs |
| Queues / cache | **Redis + BullMQ** | Daily reminders, notification sending, PDF generation, rate limiting |
| Web apps | **Next.js 16** (App Router) + **Tailwind CSS** | |
| Web UI kit | shadcn/ui, TanStack Query, TanStack Table, react-hook-form | |
| i18n | `next-intl`, Arabic + English, RTL | Use Tailwind logical utilities (`ms-`, `me-`, `ps-`, `pe-`, `text-start`) and never `ml-`/`mr-` |
| Mobile | **Expo (React Native)** | Built last |
| PDF | **Puppeteer** (HTML to PDF) in a BullMQ worker | Handles Arabic RTL well |
| Email | Behind a channel adapter (Resend, Amazon SES or Brevo) | |
| Files | S3-compatible storage (Cloudflare R2 in production, local disk in dev) | |
| Auth | JWT access + refresh tokens in httpOnly cookies (web), optional TOTP 2FA for admins | |
| Tests | Jest + Supertest (api), Vitest (packages), Playwright (e2e, later) | |
| Lint / format | **ESLint 9** (pinned) + Prettier, shared from `packages/config` | Flat config. `eslint-config-next` plugins (react, import, jsx-a11y) do not support ESLint 10 yet |
| Local infra | Docker Compose (Postgres + Redis only) | Apps run with `npm run dev`, not in Docker |
| Production | **Render** (api, garage-web, admin, managed Postgres, Key-Value/Redis), Cloudflare for DNS | See "Deployment" |

---

## 3. Repository structure

```
gearva/
├── apps/
│   ├── api/                      # NestJS backend (one API for V1, V2 and mobile)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── worker.ts         # BullMQ workers entrypoint (can start inside main.ts at first)
│   │   │   ├── common/           # tenant context, guards, interceptors, filters, pagination
│   │   │   ├── auth/             # login, refresh, invites, password reset, 2FA
│   │   │   ├── admin/            # ALL V2 endpoints (own guard, own route prefix)
│   │   │   ├── garages/
│   │   │   ├── branches/
│   │   │   ├── users/            # garage staff
│   │   │   ├── owners/           # global car-owner accounts
│   │   │   ├── customers/        # per-garage link to an owner
│   │   │   ├── vehicles/
│   │   │   ├── visits/           # one visit = one invoice
│   │   │   ├── maintenance/      # service records, next-change logic
│   │   │   ├── suggestions/      # per-garage autocomplete (brands, grades, makes)
│   │   │   ├── invoices/
│   │   │   ├── payments/
│   │   │   ├── subscriptions/
│   │   │   ├── reminders/
│   │   │   ├── notifications/    # channel interface + adapters
│   │   │   ├── offers/
│   │   │   ├── files/
│   │   │   ├── audit/
│   │   │   └── health/
│   │   └── package.json
│   ├── garage-web/               # Next.js, V1
│   │   ├── app/                  # routes under app/[locale]/...
│   │   ├── components/           # app-specific components
│   │   ├── features/             # customers/, vehicles/, quick-entry/, invoices/ ...
│   │   ├── lib/                  # api client, auth, utils
│   │   └── messages/             # ar.json, en.json
│   ├── admin/                    # Next.js, V2 (separate deployment and domain)
│   └── mobile/                   # Expo app (create in phase 6)
├── packages/
│   ├── database/                 # Prisma schema, migrations, seed, RLS SQL, client factory
│   ├── contracts/                # Zod schemas, DTO types, enums, constants, km/miles helpers
│   ├── ui/                       # small Tailwind components shared by garage-web and admin
│   └── config/                   # shared tsconfig, eslint, prettier
├── docs/                         # flow.md, database.md
├── docker-compose.yml            # Postgres + Redis for local development
├── turbo.json
├── package.json                  # npm workspaces
├── .env.example
├── CLAUDE.md                     # working rules for AI assistants
└── README.md
```

Do **not** create `packages/utils` until real duplication exists. `packages/ui` was created in step 1.6b, when `garage-web` needed the same form controls as `admin`. It ships TypeScript source (each app lists it in `transpilePackages` and scans it with Tailwind `@source`) and holds only pieces with no app-specific imports: anything that uses an app's translations or API client stays in that app. Business workflows never go in shared packages.

### Naming rules

- Nest "service" means a provider class. The domain concept "service" is called **maintenance** in code (`maintenance/`, `ServiceRecord`, `ServiceType`).
- Route prefixes: garage staff `/v1/...`, admin `/admin/v1/...`, owner mobile `/mobile/v1/...`.
- Files: `kebab-case.ts`. Classes: `PascalCase`. DB tables: `snake_case` (via `@@map`). Columns in Prisma are `camelCase` mapped to `snake_case`.

---

## 4. Getting started (local)

```bash
# 1. Install
npm install

# 2. Environment
cp .env.example .env

# 3. Start Postgres + Redis
npm run db:up

# 4. Database
(cd packages/database && npx prisma migrate deploy)   # apply all migrations (incl. RLS SQL); rerun after any DB wipe
npm run db:seed           # the first super-admin (more seed data arrives with later steps)

# 5. Run everything
npm run dev               # turbo runs api + garage-web + admin
```

Default local ports: `api` 4000, `garage-web` 3000, `admin` 3001, Postgres 5432, Redis 6379.

### Root `package.json` scripts

```
dev, build, lint, typecheck, test, format, format:check
db:up, db:down, db:generate, db:migrate, db:reset, db:seed, db:studio
test:tenancy          # the tenant-isolation suite, must always pass
```

`db:seed` and `test:tenancy` are added in Phase 1, when there is something to seed and test.

### Environment variables (`.env.example`)

```
NODE_ENV=development

# Database (three roles, see database.md section 6)
DATABASE_URL=postgresql://gearva_app:gearva_app@localhost:5432/gearva          # runtime, RLS enforced
MIGRATION_DATABASE_URL=postgresql://gearva_migrator:gearva_migrator@localhost:5432/gearva
PLATFORM_DATABASE_URL=postgresql://gearva_platform:gearva_platform@localhost:5432/gearva  # admin stats only

REDIS_URL=redis://localhost:6379

# Auth
JWT_ACCESS_SECRET=change-me                          # signs access tokens; 32+ chars in production
APP_URL_GARAGE=http://localhost:3000
APP_URL_ADMIN=http://localhost:3001
API_URL=http://localhost:4000                        # where the web apps forward /v1 and /admin/v1
TOTP_ENCRYPTION_KEY=                                 # 32 random bytes, base64; encrypts admin TOTP secrets (AES-256-GCM)

# Seed (npm run db:seed): the first SUPER_ADMIN (password: 12+ characters)
SEED_ADMIN_EMAIL=admin@gearva.online
SEED_ADMIN_PASSWORD=
SEED_DEMO_OWNER_EMAIL=owner@demo.gearva.local       # development only: demo garage owner login
SEED_DEMO_OWNER_PASSWORD=                            # 10+ characters; empty = no demo garage

# Email (adapter: console | resend | ses)
EMAIL_ADAPTER=console
EMAIL_FROM="Gearva <no-reply@gearva.online>"
RESEND_API_KEY=

# Files (adapter: local | s3)
FILES_ADAPTER=local
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=

# Later
WHATSAPP_ADAPTER=disabled
```

---

## 5. Architecture rules (the important part)

Anyone writing code here (human or AI) must follow these.

### 5.1 Tenant isolation
1. Every tenant table has a `garage_id` column. See `database.md` for the list.
2. Every request resolves a **tenant context** (`garageId`, `userId`, `role`, `branchId?`) in `common/`, stored with `AsyncLocalStorage` (nestjs-cls).
3. The Prisma client used at runtime is wrapped so every query runs in a transaction that first executes `SELECT set_config('app.garage_id', '<id>', true)`. Postgres RLS policies then filter by it. This is the **second** line of defense.
4. The **first** line is code: services always filter by `garageId` from context, never from the request body or URL.
5. Never accept `garageId` from the client for garage endpoints.
6. The suite `npm run test:tenancy` creates two garages and proves garage A can never read, update or delete garage B data through every endpoint. **Add the new endpoint to this suite in the same commit as the endpoint.**

### 5.2 Auth and roles
- Garage staff roles: `OWNER`, `MANAGER`, `MECHANIC`, `RECEPTIONIST`. Permission matrix in `flow.md`.
- Admin roles: `SUPER_ADMIN`, `ADMIN`. Admin TOTP 2FA is optional per admin and recommended (flow.md 2.3). Admin endpoints live only under `apps/api/src/admin` with `AdminGuard`.
- Owners (mobile) log in by phone number with a one-time code.
- Access tokens are JWTs that last 15 minutes. Refresh tokens are random values that last 30 days; only their hash is stored in `sessions`. Every refresh replaces the token, and presenting an already-replaced one revokes all of that person's sessions (it means the token was copied).
- Both live in httpOnly, SameSite=Lax cookies (Secure in production) that are **host-only**: each web app forwards its API paths to the API (`admin` forwards `/admin/v1/*`, `garage-web` forwards `/v1/*`), so the browser sees the cookies as belonging to `admin.gearva.online` or `app.gearva.online` and never sends admin cookies to the garage app or the other way round. No CORS and no shared cookie domain are needed.

### 5.3 Subscription lock
A global guard rejects every garage request when the garage is `SUSPENDED` or `expiresAt < now`, with error code `GARAGE_LOCKED`. The web app shows a lock screen. No manual work is needed after the date passes.

### 5.4 Data rules
- IDs are UUID v7 (`@default(uuid(7))`).
- Timestamps are stored in UTC. Each garage has a timezone (default `Asia/Beirut`).
- **Money is stored as integer cents** (`Int`), currency USD. LBP is a display-only conversion using a garage-set rate. Never use floats for money.
- **Distance is stored in km internally.** Each vehicle has a display unit (`KM` or `MI`). Convert only at the edges using helpers in `contracts` (1 mi = 1.609344 km).
- Invoices are **never deleted**. A mistake is fixed by cancelling with a reason and issuing a new invoice.
- Invoice numbers are sequential per garage + branch + year with no gaps, allocated in a transaction (see `flow.md`).
- Customer lists can never be exported. All list endpoints are paginated (max 50 per page) and rate limited. There is no CSV export endpoint.

### 5.5 Notifications
All outgoing messages go through one interface:

```ts
interface NotificationChannel {
  channel: 'EMAIL' | 'IN_APP' | 'PUSH' | 'WHATSAPP';
  send(input: { recipient: string; template: string; locale: 'ar' | 'en'; data: Record<string, unknown> }): Promise<SendResult>;
}
```

Build `EMAIL` and `IN_APP` first. `WHATSAPP` is a later adapter and must need zero changes outside `notifications/`. Every send writes a `notifications` row (status, channel, error; log and in-app inbox are one table, see database.md 4.6) and uses a dedupe key. `SendResult` is `{ ok: true } | { ok: false, error }`; the pipeline stores `SENT`, `FAILED` or `SKIPPED` from it.

### 5.6 API conventions
- REST + JSON, validated with Zod schemas from `packages/contracts`.
- Error shape: `{ "code": "INVOICE_ALREADY_CANCELLED", "message": "...", "details": {} }`. Codes are constants in `contracts`.
- Pagination: `?page=1&pageSize=20`, response `{ items, page, pageSize, total }`.
- Every mutating endpoint writes an `AuditLog` row (interceptor).
- Heavy work (PDF, emails, reminders) goes to BullMQ, never inline in a request.

### 5.7 Frontend conventions
- Server state with TanStack Query. Forms with react-hook-form + Zod resolver using the **same** schema as the API.
- Mobile-first layouts: mechanics use phones in the garage.
- **Quick entry must stay under 20 seconds**: search by plate or phone, tap a service, confirm. Do not add required fields to this flow. Extra fields go in the collapsed "More details".
- Every user-facing string goes through `next-intl` (`messages/ar.json`, `messages/en.json`). No hardcoded text.

---

## 6. Build roadmap (work step by step)

Each phase ends with a working, tested slice. Do not start the next phase until the "Done when" list is true. After phase 3, deploy a first version (see "Deployment").

### Phase 0: Skeleton
- npm workspaces, Turborepo, `packages/config`, `packages/contracts`, `packages/database`, `apps/api`, `apps/garage-web`, `apps/admin`
- Docker Compose for Postgres + Redis, `.env.example`, scripts above
- **Done when:** `npm run dev` starts all apps, `GET /health` works, lint and typecheck pass.

### Phase 1: Auth, tenancy, garages
- Prisma schema for: `AdminUser`, `Garage`, `GarageSettings`, `Branch`, `User`, sessions, `AuditLog`, `Notification`
- Minimal notification module: the channel interface and the email adapter (console output in dev), because the garage owner's invite email is needed now. Later phases only enqueue notifications
- Audit interceptor, so every mutating endpoint writes an `AuditLog` row from day one
- Two DB roles, RLS policies, tenant context, Prisma wrapper
- Admin login (optional 2FA); admin creates a garage, generates the owner login (invite email), suspends, resets password
- Staff login, staff roles, branches
- Subscription lock guard
- **Done when:** admin creates a garage, owner logs in, and `test:tenancy` proves isolation. A suspended garage is locked.

### Phase 2: Customers, vehicles, maintenance
- `Owner`, `GarageCustomer`, `Vehicle`, `ServiceType`, `Suggestion`, `Visit`, `ServiceRecord`
- Quick entry screen (under 20 seconds), service history timeline, km/miles, average daily usage and estimated km
- Next-change logic and reminder rows created on save
- **Done when:** a mechanic can add a customer, a car, and a service on a phone in under 20 seconds, and the next due km/date is correct.

### Phase 3: Invoices and payments
- `Invoice`, `InvoiceItem`, `InvoiceCounter`, `Payment`, `File` (logo, invoice PDFs), "Finish visit" creates the invoice
- Create the `Offer` table in this phase's migration too, so `invoices.offerId` has a real foreign key and discounts can be applied on an invoice. Offer screens, targeting and broadcasts stay in Phase 7
- PDF generation (Arabic + English), print, cancel with reason, edit window, debt list, garage invoice settings
- **Done when:** finishing a visit produces a correct sequential invoice PDF, partial payments update the remaining amount, and the debt list is right.
- **Deploy a first version to Render now (section 9).**

### Phase 4: Reminders and notifications
- Extend the notification module from Phase 1: in-app adapter and inbox, notification log screen (the `notifications` table), retries, dedupe keys, daily BullMQ job, monthly reminder, daytime-only rule, fair-use cap
- **Done when:** the daily job sends exactly one reminder per due car and the log shows delivered or failed.

### Phase 5: Admin completion
- Subscription payments, expiring-soon list, paid/unpaid list, usage monitoring, system settings (default service types, reminder rules), view-as-garage with access log, business view
- **Done when:** the admin can run the whole subscription lifecycle without touching the database.

### Phase 6: Owner mobile app
- Expo app, phone + OTP login, cars, history, invoices, in-app notifications, push, offers
- Owner-scoped access (see `database.md`)

### Phase 7: Offers, revenue screens, polish
- Offer screens, targeting, broadcasts and the redemption report (the `offers` table and invoice discounts already exist since Phase 3), revenue screens per day/month/year/service/branch, customer value, data-protection checks, audit log screen

### Later (not in scope now)
WhatsApp channel, appointment booking, parts and inventory, monthly report, customer approval for repairs, document expiry reminders, referral tracking, sales reps, fleet plan.

---

## 7. Open decisions (confirm before the phase that needs them)

| Decision | Default used in docs | Needed by |
|---|---|---|
| Staff login identifier | email + password | Phase 1 |
| Subscription price | about $200/year, +$100 per extra branch (set in admin, not hardcoded) | Phase 5 |
| Reminder lead time | 500 km or 7 days before due (garage-editable) | Phase 4 |
| Default daily km for a car with no history | 35 km/day (system setting) | Phase 2 |
| Daytime sending window | 09:00 to 20:00 garage time | Phase 4 |
| Fair-use message cap per garage | set later, from real cost data | Phase 5 |
| VAT on invoices | off by default, toggle only after accountant confirms | Phase 3 |
| Owner OTP delivery | SMS or email at first, WhatsApp later | Phase 6 |

---

## 8. Testing

- `npm test` runs unit tests everywhere.
- `npm run test:tenancy` is mandatory in CI and must never be skipped.
- Pure logic with edge cases must have unit tests: next-change calculation, estimated km, km/miles conversion, invoice number allocation (including concurrent requests), reminder dedupe.
- Run migrations against a real Postgres in tests (no SQLite, no mocks for the database).

---

## 9. Deployment on Render (when the first slice works)

Everything runs on **Render**, managed from one dashboard. Render is chosen to avoid server work. The code stays host-independent, so it can move to a VPS later if costs matter.

### Services (one Render workspace, one project)

| Render service | Type | Root directory | Notes |
|---|---|---|---|
| `gearva-api` | Web Service (Node) | `apps/api` | Health check path `/health`. Start on Starter; move to a bigger plan if Puppeteer runs out of memory |
| `gearva-garage-web` | Web Service (Node) | `apps/garage-web` | Next.js (V1) |
| `gearva-admin` | Web Service (Node) | `apps/admin` | Next.js (V2), separate service and domain |
| `gearva-db` | Managed Postgres (paid plan) | n/a | Do not use the free database, it expires after 30 days |
| `gearva-redis` | Key-Value (Redis-compatible) | n/a | Used by BullMQ and rate limiting |
| `gearva-worker` (later) | Background Worker | `apps/api` | Runs `worker.ts` once the BullMQ jobs become heavy. Until then workers run inside the API process |

Keep **one repo**. Each service points at its folder inside the monorepo and builds from the repo root.

### How to deploy
1. Add a `render.yaml` (Blueprint) at the repo root that defines the services above, so the whole setup is created in one step.
2. Build command (from the repo root): `npm ci && npx turbo run build --filter=<workspace-name>`. Start command: for example `node apps/api/dist/main.js` for the API and `npm run start --workspace apps/garage-web` for the web apps.
3. Run migrations as the API's **pre-deploy command**: `npx prisma migrate deploy` (it uses `MIGRATION_DATABASE_URL`).
4. Put environment variables in a Render **environment group** shared by the services. Never commit secrets.
5. Deploys happen automatically on every push to `main`. Use a separate Render project or branch for staging if you need one.
6. Custom domains: `app.gearva.online` (garage-web), `admin.gearva.online` (admin), `api.gearva.online` (api), and `API_URL=https://api.gearva.online` for the two web apps. Login cookies are host-only and travel through each web app's forwarding (section 5.2), so they work on any domain; the custom domains are for the product, not for cookies.

### Things to check when you set it up
- **Postgres roles:** the design uses three DB roles (database.md section 6). Confirm that Render's Postgres lets you create roles. If it does not allow `BYPASSRLS`, use the policy fallback described in database.md section 6.1.
- **Puppeteer:** Chrome must be available at runtime. Either set `PUPPETEER_CACHE_DIR` to a folder inside the project so the build keeps the download, or deploy the API with a Dockerfile.
- **Free instances sleep** after 15 minutes without traffic, so use them for demos only. Real garages need paid always-on services.
- **Backups:** turn on the database plan's backups and **test a restore** before the first real garage goes live. Optionally also run a nightly `pg_dump` to object storage.
- **Files:** keep invoice PDFs and photos in object storage (Cloudflare R2), not on Render's disk, which is lost on redeploy unless you attach a paid disk.
- **Monitoring:** Sentry for errors, plus an uptime monitor on `/health`.

### Expected cost
Roughly $30-45 per month for three small services, Postgres and Redis. A larger API plan for Puppeteer adds about $20. Check Render's pricing page for current prices.

---

## 10. Working rules for AI assistants (Claude, etc.)

1. Read `README.md`, `flow.md` and `database.md` before coding. Work on **one roadmap phase at a time** and stop at its "Done when".
2. Before writing a module, state which section of `flow.md` and `database.md` it implements. If the docs are unclear or wrong, ask or propose a doc change first.
3. Never query a tenant table outside the tenant context. Never take `garageId` from client input.
4. Add the tenant-isolation test for every new endpoint in the same change.
5. Put shared schemas and types in `packages/contracts` first, then use them in api and web.
6. No hardcoded UI strings, no `ml-`/`mr-` classes, no floats for money, no deleting invoices.
7. Keep changes small and runnable: after each step the app must start and tests must pass.
8. Do not add dependencies, packages or folders that the current phase does not need.
