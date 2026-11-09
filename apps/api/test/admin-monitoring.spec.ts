// Step 5.4: admin monitoring and the business view (flow.md 11.2, 11.5). Other test files
// create garages and payments at the same time, so each test finds its own garages by a
// unique name, and totals are checked to grow by at least this test's own amounts.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type {
  BusinessView,
  ExpiringGarages,
  FailedMessage,
  MonitoredGarage,
  Paginated,
} from '@gearva/contracts';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { PlatformDb } from '../src/common/db/platform-db';
import { signInAsNewAdmin } from './helpers/admin';
import { createTestApp } from './helpers/app';
import { createGarageWithOwner, randomPhone, staffLogin } from './helpers/staff';

const DAY = 24 * 60 * 60 * 1000;

describe('Admin monitoring', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let cookie: string;
  const run = randomUUID().slice(0, 8);

  const asAdmin = (url: string) =>
    request(app.getHttpServer()).get(url).set('Cookie', cookie).expect(200);

  /** A garage with an owner, renamed so this test can find it. */
  async function garage(label: string, data: object = {}) {
    const g = await createGarageWithOwner(app);
    await platform.garage.update({
      where: { id: g.garageId },
      data: { name: `[mon ${run}] ${label}`, ...data },
    });
    return g;
  }

  const usage = async (query: string) =>
    (
      await asAdmin(
        `/admin/v1/monitoring/usage?q=${encodeURIComponent(`[mon ${run}]`)}&pageSize=50&${query}`,
      )
    ).body as Paginated<MonitoredGarage>;

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    ({ cookie } = await signInAsNewAdmin(app));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('every monitoring route needs a signed-in admin', async () => {
    for (const url of [
      '/admin/v1/monitoring/expiring',
      '/admin/v1/monitoring/usage',
      '/admin/v1/monitoring/failures',
      '/admin/v1/business',
    ]) {
      await request(app.getHttpServer()).get(url).expect(401);
    }
  });

  it('lists paid periods ending within 3 weeks and trials within 7 days, soonest first', async () => {
    const soon = await garage('paid soon', { expiresAt: new Date(Date.now() + 10 * DAY) });
    const sooner = await garage('paid sooner', { expiresAt: new Date(Date.now() + 2 * DAY) });
    const later = await garage('paid later', { expiresAt: new Date(Date.now() + 60 * DAY) });
    const trial = await garage('trial', {
      status: 'TRIAL',
      isPaid: false,
      expiresAt: null,
      trialEndsAt: new Date(Date.now() + 3 * DAY),
    });
    const res = (await asAdmin('/admin/v1/monitoring/expiring')).body as ExpiringGarages;
    const paidIds = res.paid.map((g) => g.id);
    expect(paidIds).toContain(soon.garageId);
    expect(paidIds.indexOf(sooner.garageId)).toBeLessThan(paidIds.indexOf(soon.garageId));
    expect(paidIds).not.toContain(later.garageId);
    expect(res.trials.map((g) => g.id)).toContain(trial.garageId);
    // A wider window finds the later one too.
    const wide = (await asAdmin('/admin/v1/monitoring/expiring?paidDays=90'))
      .body as ExpiringGarages;
    expect(wide.paid.map((g) => g.id)).toContain(later.garageId);
  });

  it('counts customers, cars, invoices and messages of each garage, never their names', async () => {
    const g = await garage('busy');
    const { cookie: owner } = await staffLogin(app, g.ownerEmail, g.password);
    const http = () => request(app.getHttpServer());
    const oil = await platform.serviceType.findFirstOrThrow({
      where: { garageId: null, code: 'OIL_CHANGE' },
    });
    for (let i = 0; i < 2; i++) {
      const customer = (
        await http()
          .post('/v1/customers')
          .set('Cookie', owner)
          .send({ name: `Customer ${i}`, phone: randomPhone() })
          .expect(201)
      ).body as { id: string };
      const car = (
        await http()
          .post(`/v1/customers/${customer.id}/vehicles`)
          .set('Cookie', owner)
          .send({
            plate: `M ${run}${i}`,
            make: 'Kia',
            model: 'Rio',
            distanceUnit: 'KM',
            odometer: 1000,
          })
          .expect(201)
      ).body as { id: string };
      await http()
        .post('/v1/visits/quick')
        .set('Cookie', owner)
        .send({
          vehicleId: car.id,
          odometer: 1100,
          services: [{ serviceTypeId: oil.id, unitPriceCents: 1000 }],
        })
        .expect(201);
    }
    const message = (channel: 'EMAIL' | 'WHATSAPP', status: 'SENT' | 'FAILED') => ({
      garageId: g.garageId,
      channel,
      type: 'SERVICE_REMINDER' as const,
      template: 'service-reminder',
      locale: 'en',
      recipient: 'someone@test.local',
      payload: {},
      status,
      dedupeKey: `MON:${randomUUID()}`,
    });
    await platform.notification.createMany({
      data: [
        message('EMAIL', 'SENT'),
        message('EMAIL', 'SENT'),
        message('EMAIL', 'FAILED'),
        message('WHATSAPP', 'SENT'),
      ],
    });

    const res = await usage('');
    const row = res.items.find((i) => i.id === g.garageId);
    expect(row?.usage).toMatchObject({
      customers: 2,
      vehicles: 2,
      invoicesThisMonth: 2,
      emailsSent: 2,
      emailsFailed: 1,
      whatsappSent: 1,
    });
    expect(row?.usage.lastVisitAt).not.toBeNull();
    expect(row?.branchCount).toBe(1);
    expect(JSON.stringify(res)).not.toContain('Customer 0');
  });

  it('finds inactive garages: no sign-in and no visit for N days', async () => {
    const old = new Date(Date.now() - 90 * DAY);
    const idle = await garage('idle', { lastLoginAt: old });
    const working = await garage('working', { lastLoginAt: old });
    // Signed in long ago, but records visits every day (sessions last 30 days).
    const { cookie: owner } = await staffLogin(app, working.ownerEmail, working.password);
    await platform.garage.update({ where: { id: working.garageId }, data: { lastLoginAt: old } });
    const customer = (
      await request(app.getHttpServer())
        .post('/v1/customers')
        .set('Cookie', owner)
        .send({ name: 'Daily', phone: randomPhone() })
        .expect(201)
    ).body as { id: string };
    const car = (
      await request(app.getHttpServer())
        .post(`/v1/customers/${customer.id}/vehicles`)
        .set('Cookie', owner)
        .send({ plate: `W ${run}`, make: 'Kia', model: 'Rio', distanceUnit: 'KM', odometer: 1000 })
        .expect(201)
    ).body as { id: string };
    await request(app.getHttpServer())
      .post('/v1/visits')
      .set('Cookie', owner)
      .send({ vehicleId: car.id, odometer: 1050 })
      .expect(201);

    const ids = (await usage('inactiveDays=30')).items.map((i) => i.id);
    expect(ids).toContain(idle.garageId);
    expect(ids).not.toContain(working.garageId);
  });

  it('filters by status and paid', async () => {
    const trial = await garage('filter trial', { status: 'TRIAL', isPaid: false, expiresAt: null });
    const ids = (await usage('status=TRIAL&paid=false')).items.map((i) => i.id);
    expect(ids).toContain(trial.garageId);
    expect((await usage('paid=true')).items.map((i) => i.id)).not.toContain(trial.garageId);
  });

  it('lists failed messages with the reason, never the recipient', async () => {
    const g = await garage('failing');
    await platform.notification.create({
      data: {
        garageId: g.garageId,
        channel: 'EMAIL',
        type: 'SERVICE_REMINDER',
        template: 'service-reminder',
        locale: 'en',
        recipient: 'private@customer.test',
        payload: { customerName: 'Private Name' },
        status: 'FAILED',
        error: 'Mailbox full',
        dedupeKey: `MON:${randomUUID()}`,
      },
    });
    const res = (await asAdmin(`/admin/v1/monitoring/failures?garageId=${g.garageId}`))
      .body as Paginated<FailedMessage>;
    expect(res.items).toEqual([
      expect.objectContaining({
        garage: { id: g.garageId, name: `[mon ${run}] failing` },
        channel: 'EMAIL',
        error: 'Mailbox full',
      }),
    ]);
    expect(JSON.stringify(res)).not.toMatch(/private@customer|Private Name/);
  });

  it('the business view adds up subscription payments by month and year', async () => {
    const before = (await asAdmin('/admin/v1/business')).body as BusinessView;
    expect(before.months).toHaveLength(12);
    const g = await garage('paying');
    const recordedBy = await platform.adminUser.findFirstOrThrow();
    const noon = new Date();
    await platform.subscriptionPayment.create({
      data: {
        garageId: g.garageId,
        amountCents: 12_345,
        method: 'WHISH',
        paidAt: noon,
        periodStart: noon,
        newExpiryDate: new Date(noon.getTime() + 365 * DAY),
        recordedById: recordedBy.id,
      },
    });
    const after = (await asAdmin('/admin/v1/business')).body as BusinessView;
    const thisMonth = noon.toISOString().slice(0, 7);
    const month = (v: BusinessView) => v.months.find((m) => m.month === thisMonth);
    expect(after.months.at(-1)?.month).toBe(thisMonth);
    expect(
      (month(after)?.revenueCents ?? 0) - (month(before)?.revenueCents ?? 0),
    ).toBeGreaterThanOrEqual(12_345);
    expect(after.revenueThisYearCents - before.revenueThisYearCents).toBeGreaterThanOrEqual(12_345);
    expect(after.byMethod.WHISH - before.byMethod.WHISH).toBeGreaterThanOrEqual(12_345);
    expect(month(after)?.newGarages).toBeGreaterThan(0);
    const total = Object.values(after.byStatus).reduce((a, b) => a + b, 0);
    expect(after.paid + after.unpaid).toBe(total);
  });
});
