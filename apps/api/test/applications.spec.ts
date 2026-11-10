// Step 5.6: applications from the public website, and the admin's review (flow.md 11.6).
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { SYSTEM_SETTING_DEFAULTS, type SystemSettings } from '@gearva/contracts';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { PlatformDb } from '../src/common/db/platform-db';
import { SystemSettingsService } from '../src/system-settings/system-settings.service';
import { signInAsNewAdmin } from './helpers/admin';
import { createTestApp } from './helpers/app';
import { randomPhone } from './helpers/staff';

const DAY = 24 * 60 * 60 * 1000;

// Other test files change the real settings, so this app reads fixed ones.
const settings: SystemSettings = {
  ...SYSTEM_SETTING_DEFAULTS,
  yearPriceCents: 12_300,
  extraBranchPriceCents: 4_500,
  trialDays: 14,
};

describe('Applications', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let cookie: string;
  let adminId: string;
  /** In every garage name here, so lists can be narrowed to this run. */
  const run = randomUUID().slice(0, 8);

  const http = () => request(app.getHttpServer());
  const asAdmin = {
    get: (url: string) => http().get(url).set('Cookie', cookie),
    post: (url: string, body?: object) => http().post(url).set('Cookie', cookie).send(body),
  };

  function application(overrides: Record<string, unknown> = {}) {
    return {
      garageName: `[test] Applied ${run} ${randomUUID().slice(0, 6)}`,
      ownerName: 'Applying Owner',
      email: `Apply-${randomUUID()}@Test.Local`,
      phone: randomPhone(),
      city: 'Jounieh',
      branchCount: 2,
      message: 'We have two branches.',
      ...overrides,
    };
  }

  /** Sends an application like the website; returns its stored row. */
  async function apply(overrides: Record<string, unknown> = {}) {
    const body = application(overrides);
    await http().post('/v1/public/applications').send(body).expect(202);
    return platform.garageApplication.findFirstOrThrow({
      where: { email: body.email.toLowerCase() },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** The create-garage form, filled in from an application as the admin page does. */
  function garageForm(a: { garageName: string; ownerName: string; email: string; phone: string }) {
    return {
      name: a.garageName,
      ownerName: a.ownerName,
      email: a.email,
      phone: a.phone,
      locationText: 'Jounieh',
      defaultLocale: 'en',
      plan: 'TRIAL',
    };
  }

  beforeAll(async () => {
    app = await createTestApp([], (builder) =>
      builder.overrideProvider(SystemSettingsService).useValue({ get: async () => settings }),
    );
    platform = app.get(PlatformDb).client;
    ({ adminId, cookie } = await signInAsNewAdmin(app));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('the website shows the prices from the system settings, without signing in', async () => {
    const res = await http().get('/v1/public/pricing').expect(200);
    expect(res.body).toEqual({
      yearPriceCents: 12_300,
      extraBranchPriceCents: 4_500,
      trialDays: 14,
    });
  });

  it('stores an application as NEW, and tells the visitor nothing more', async () => {
    const body = application({ phone: '03 123 456', message: '' });
    const res = await http().post('/v1/public/applications').send(body).expect(202);
    expect(res.body).toEqual({});

    const row = await platform.garageApplication.findFirstOrThrow({
      where: { email: body.email.toLowerCase() },
    });
    expect(row).toMatchObject({
      garageName: body.garageName,
      phone: '+9613123456',
      branchCount: 2,
      message: null,
      status: 'NEW',
      garageId: null,
    });
    expect(row.ip).toBeTruthy();
    // No account of any kind.
    expect(await platform.garage.count({ where: { email: row.email } })).toBe(0);
    expect(await platform.user.count({ where: { email: row.email } })).toBe(0);
  });

  it('answers a filled-in honeypot the same, but stores nothing', async () => {
    const body = application({ website: 'http://spam.example' });
    await http().post('/v1/public/applications').send(body).expect(202);
    expect(
      await platform.garageApplication.count({ where: { email: body.email.toLowerCase() } }),
    ).toBe(0);
  });

  it('checks the form', async () => {
    for (const bad of [
      { garageName: '' },
      { email: 'not an email' },
      { phone: '123' },
      { branchCount: 0 },
      { branchCount: 51 },
      { city: undefined },
    ]) {
      const res = await http().post('/v1/public/applications').send(application(bad));
      expect(res.status).toBe(400);
    }
  });

  it('every review endpoint needs a signed-in admin', async () => {
    const a = await apply();
    await http().get('/admin/v1/applications').expect(401);
    await http().get(`/admin/v1/applications/${a.id}`).expect(401);
    await http().post(`/admin/v1/applications/${a.id}/reject`).send({ reason: 'No' }).expect(401);
    await http().post(`/admin/v1/applications/${a.id}/approve`).send(garageForm(a)).expect(401);
  });

  it('lists new applications first, and filters', async () => {
    const rejected = await apply();
    await asAdmin
      .post(`/admin/v1/applications/${rejected.id}/reject`, { reason: 'Not a garage' })
      .expect(200);
    const fresh = await apply();

    const all = await asAdmin.get(`/admin/v1/applications?q=${run}&pageSize=50`).expect(200);
    const statuses = (all.body.items as { status: string }[]).map((i) => i.status);
    expect(statuses.indexOf('REJECTED')).toBeGreaterThan(statuses.lastIndexOf('NEW'));
    expect(all.body.items.map((i: { id: string }) => i.id)).toEqual(
      expect.arrayContaining([rejected.id, fresh.id]),
    );

    const onlyNew = await asAdmin.get(`/admin/v1/applications?q=${run}&status=NEW`).expect(200);
    expect(onlyNew.body.items.every((i: { status: string }) => i.status === 'NEW')).toBe(true);
    const byEmail = await asAdmin
      .get(`/admin/v1/applications?q=${encodeURIComponent(fresh.email)}`)
      .expect(200);
    expect(byEmail.body.items.map((i: { id: string }) => i.id)).toEqual([fresh.id]);
  });

  it('shows earlier applications with the same email or phone', async () => {
    const phone = randomPhone();
    const email = `again-${randomUUID()}@test.local`;
    const first = await apply({ email });
    const second = await apply({ phone });
    const third = await apply({ email, phone });
    await apply(); // unrelated

    const res = await asAdmin.get(`/admin/v1/applications/${third.id}`).expect(200);
    expect(res.body).toMatchObject({ id: third.id, message: 'We have two branches.' });
    expect(res.body.earlier.map((e: { id: string }) => e.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    await asAdmin.get(`/admin/v1/applications/${randomUUID()}`).expect(404);
  });

  it('approving creates the garage with its owner invite, and links it', async () => {
    const a = await apply();
    const before = Date.now();
    const res = await asAdmin
      .post(`/admin/v1/applications/${a.id}/approve`, garageForm(a))
      .expect(201);
    const garage = res.body;
    expect(garage).toMatchObject({
      name: a.garageName,
      email: a.email,
      status: 'TRIAL',
      owner: { name: 'Applying Owner', hasPassword: false },
    });
    // The trial length comes from the system settings.
    const trialMs = new Date(garage.trialEndsAt).getTime() - before;
    expect(Math.round(trialMs / DAY)).toBe(14);

    const row = await platform.garageApplication.findUniqueOrThrow({ where: { id: a.id } });
    expect(row).toMatchObject({ status: 'APPROVED', garageId: garage.id, reviewedById: adminId });
    expect(row.reviewedAt).toBeTruthy();
    expect(
      await platform.notification.count({
        where: { userId: garage.owner.id, template: 'staff-invite' },
      }),
    ).toBe(1);
    expect(
      await platform.auditLog.count({
        where: { action: 'application.approve', garageId: garage.id, actorId: adminId },
      }),
    ).toBe(1);

    const detail = await asAdmin.get(`/admin/v1/applications/${a.id}`).expect(200);
    expect(detail.body).toMatchObject({
      status: 'APPROVED',
      garageId: garage.id,
      reviewedBy: { id: adminId },
    });

    // Once only.
    const again = await asAdmin
      .post(
        `/admin/v1/applications/${a.id}/approve`,
        garageForm({ ...a, email: `other-${randomUUID()}@test.local` }),
      )
      .expect(409);
    expect(again.body.code).toBe('APPLICATION_ALREADY_REVIEWED');
  });

  it('a garage that cannot be created leaves the application new', async () => {
    const taken = await apply();
    await asAdmin.post(`/admin/v1/applications/${taken.id}/approve`, garageForm(taken)).expect(201);
    // Someone applies again with the email that already has an account.
    const a = await apply({ email: taken.email });
    const res = await asAdmin
      .post(`/admin/v1/applications/${a.id}/approve`, garageForm(a))
      .expect(409);
    expect(res.body.code).toBe('EMAIL_ALREADY_USED');
    const row = await platform.garageApplication.findUniqueOrThrow({ where: { id: a.id } });
    expect(row).toMatchObject({ status: 'NEW', garageId: null, reviewedById: null });
  });

  it('two admins approving at once create one garage', async () => {
    const a = await apply();
    const forms = [1, 2].map(() => garageForm({ ...a, email: `race-${randomUUID()}@test.local` }));
    const results = await Promise.all(
      forms.map((form) => asAdmin.post(`/admin/v1/applications/${a.id}/approve`, form)),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await platform.garage.count({ where: { email: { in: forms.map((f) => f.email) } } }),
    ).toBe(1);
  });

  it('rejecting needs a reason, and is final', async () => {
    const a = await apply();
    await asAdmin.post(`/admin/v1/applications/${a.id}/reject`, { reason: '' }).expect(400);

    const res = await asAdmin
      .post(`/admin/v1/applications/${a.id}/reject`, { reason: 'Duplicate of an existing garage' })
      .expect(200);
    expect(res.body).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'Duplicate of an existing garage',
      reviewedBy: { id: adminId },
      garageId: null,
    });
    expect(
      await platform.auditLog.count({
        where: { action: 'application.reject', entityId: a.id, actorId: adminId },
      }),
    ).toBe(1);

    await asAdmin.post(`/admin/v1/applications/${a.id}/reject`, { reason: 'Again' }).expect(409);
    await asAdmin.post(`/admin/v1/applications/${a.id}/approve`, garageForm(a)).expect(409);
  });
});
