// Step 5.2: the subscription lifecycle (flow.md 2.5, 11.1): payments, trial extensions and
// the hourly expiry pass, through the real HTTP stack and the lock guard.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { type GarageDetail, addMonths, suggestNewExpiry } from '@gearva/contracts';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { PlatformDb } from '../src/common/db/platform-db';
import { GarageExpiryService } from '../src/subscriptions/garage-expiry.service';
import { signInAsNewAdmin } from './helpers/admin';
import { createTestApp } from './helpers/app';
import { createGarageWithOwner, staffLogin } from './helpers/staff';

const DAY = 24 * 60 * 60 * 1000;
const day = (offsetDays = 0) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

describe('Subscriptions', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let cookie: string;

  const http = () => request(app.getHttpServer());
  const asAdmin = {
    get: (url: string) => http().get(url).set('Cookie', cookie),
    post: (url: string, body?: object) => http().post(url).set('Cookie', cookie).send(body),
  };

  /** A garage created through the admin API: on a trial, or paid until `paidUntil`. */
  async function newGarage(paidUntil?: string): Promise<GarageDetail> {
    const id = randomUUID().slice(0, 8);
    const res = await asAdmin
      .post('/admin/v1/garages', {
        name: `[test] Garage ${id}`,
        email: `sub-${id}@test.local`,
        phone: '+961 3 000 000',
        locationText: 'Beirut',
        defaultLocale: 'en',
        ownerName: 'Owner',
        ...(paidUntil ? { plan: 'PAID', paidUntil } : { plan: 'TRIAL' }),
      })
      .expect(201);
    return res.body as GarageDetail;
  }

  const payment = (overrides: object = {}) => ({
    amountCents: 20_000,
    method: 'CASH',
    paidOn: day(),
    newExpiryDate: day(365),
    ...overrides,
  });

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    ({ cookie } = await signInAsNewAdmin(app));
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('recording a payment', () => {
    it('turns a trial into a paid, ACTIVE garage, and is listed on the garage', async () => {
      const garage = await newGarage();
      expect(garage.suggestedExpiry).toBe(addMonths(day(), 12));
      const res = await asAdmin
        .post(
          `/admin/v1/garages/${garage.id}/payments`,
          payment({ method: 'WHISH', note: 'Year 1' }),
        )
        .expect(201);
      const paid = res.body as GarageDetail;
      expect(paid).toMatchObject({ status: 'ACTIVE', isPaid: true });
      expect(paid.expiresAt).toBe(`${day(365)}T23:59:59.999Z`);
      expect(paid.payments).toEqual([
        expect.objectContaining({
          amountCents: 20_000,
          method: 'WHISH',
          paidOn: day(),
          periodStart: day(),
          newExpiryDate: day(365),
          extraBranches: 0,
          note: 'Year 1',
          recordedBy: expect.objectContaining({ name: '[test] admin' }),
        }),
      ]);
      // The next suggestion continues from the new expiry date.
      expect(paid.suggestedExpiry).toBe(addMonths(day(365), 12));
    });

    it('a renewal starts where the current paid period ends', async () => {
      const garage = await newGarage(day(20));
      const res = await asAdmin
        .post(
          `/admin/v1/garages/${garage.id}/payments`,
          payment({ newExpiryDate: suggestNewExpiry(day(20), day()), extraBranches: 1 }),
        )
        .expect(201);
      const [latest] = (res.body as GarageDetail).payments;
      expect(latest).toMatchObject({ periodStart: day(20), extraBranches: 1 });
      // A new date inside the period already paid is refused.
      await asAdmin
        .post(`/admin/v1/garages/${garage.id}/payments`, payment({ newExpiryDate: day(30) }))
        .expect(400);
    });

    it('unlocks an expired garage at once for its staff', async () => {
      const g = await createGarageWithOwner(app);
      const { cookie: staff } = await staffLogin(app, g.ownerEmail, g.password);
      // The paid period ended yesterday, and the hourly pass marked it.
      await platform.garage.update({
        where: { id: g.garageId },
        data: { expiresAt: new Date(Date.now() - DAY) },
      });
      await app.get(GarageExpiryService).markExpired(new Date(), [g.garageId]);
      const status = async () =>
        (await platform.garage.findUniqueOrThrow({ where: { id: g.garageId } })).status;
      expect(await status()).toBe('EXPIRED');
      const locked = await http().get('/v1/auth/me').set('Cookie', staff).expect(403);
      expect(locked.body.code).toBe('GARAGE_LOCKED');

      await asAdmin.post(`/admin/v1/garages/${g.garageId}/payments`, payment()).expect(201);
      expect(await status()).toBe('ACTIVE');
      // The same session works again, with no new sign-in.
      await http().get('/v1/auth/me').set('Cookie', staff).expect(200);
    });

    it('a suspended garage stays suspended', async () => {
      const garage = await newGarage();
      await asAdmin
        .post(`/admin/v1/garages/${garage.id}/suspend`, { reason: 'Abuse report' })
        .expect(200);
      const res = await asAdmin
        .post(`/admin/v1/garages/${garage.id}/payments`, payment())
        .expect(201);
      expect(res.body).toMatchObject({ status: 'SUSPENDED', isPaid: true });
    });

    it('refuses bad amounts and dates', async () => {
      const garage = await newGarage();
      const url = `/admin/v1/garages/${garage.id}/payments`;
      await asAdmin.post(url, payment({ amountCents: 0 })).expect(400);
      await asAdmin.post(url, payment({ amountCents: 12.5 })).expect(400);
      await asAdmin.post(url, payment({ method: 'CARD' })).expect(400);
      await asAdmin.post(url, payment({ paidOn: day(2) })).expect(400);
      await asAdmin.post(url, payment({ newExpiryDate: day(-1) })).expect(400);
      expect(await platform.subscriptionPayment.count({ where: { garageId: garage.id } })).toBe(0);
      await asAdmin.post(`/admin/v1/garages/${randomUUID()}/payments`, payment()).expect(404);
      await http().post(url).send(payment()).expect(401);
    });

    it('is audit logged', async () => {
      const garage = await newGarage();
      await asAdmin.post(`/admin/v1/garages/${garage.id}/payments`, payment()).expect(201);
      expect(
        await platform.auditLog.count({ where: { action: 'garage.payment', entityId: garage.id } }),
      ).toBe(1);
    });
  });

  describe('extending a trial', () => {
    it('moves the trial end later, also after it ended', async () => {
      const garage = await newGarage();
      await platform.garage.update({
        where: { id: garage.id },
        data: { trialEndsAt: new Date(Date.now() - DAY) },
      });
      await app.get(GarageExpiryService).markExpired(new Date(), [garage.id]);
      expect((await platform.garage.findUniqueOrThrow({ where: { id: garage.id } })).status).toBe(
        'EXPIRED',
      );
      const res = await asAdmin
        .post(`/admin/v1/garages/${garage.id}/extend-trial`, { trialEndsOn: day(14) })
        .expect(200);
      expect(res.body).toMatchObject({ status: 'TRIAL', trialEndsAt: `${day(14)}T23:59:59.999Z` });
      // Never shorter than the current trial.
      await asAdmin
        .post(`/admin/v1/garages/${garage.id}/extend-trial`, { trialEndsOn: day(10) })
        .expect(400);
    });

    it('is refused once the garage has paid', async () => {
      const garage = await newGarage(day(100));
      const res = await asAdmin
        .post(`/admin/v1/garages/${garage.id}/extend-trial`, { trialEndsOn: day(14) })
        .expect(409);
      expect(res.body.code).toBe('GARAGE_NOT_IN_TRIAL');
    });
  });

  describe('the hourly expiry pass', () => {
    it('marks ended paid periods and unpaid trials EXPIRED, and nothing else', async () => {
      const ended = await newGarage(day(10));
      const running = await newGarage(day(10));
      const trial = await newGarage();
      const suspended = await newGarage(day(10));
      await asAdmin
        .post(`/admin/v1/garages/${suspended.id}/suspend`, { reason: 'Check' })
        .expect(200);
      const past = new Date(Date.now() - DAY);
      await platform.garage.updateMany({
        where: { id: { in: [ended.id, suspended.id] } },
        data: { expiresAt: past },
      });
      await platform.garage.update({ where: { id: trial.id }, data: { trialEndsAt: past } });

      const service = app.get(GarageExpiryService);
      const ours = [ended.id, running.id, trial.id, suspended.id];
      expect(await service.markExpired(new Date(), ours)).toBe(2);
      const status = async (id: string) =>
        (await platform.garage.findUniqueOrThrow({ where: { id } })).status;
      expect(await status(ended.id)).toBe('EXPIRED');
      expect(await status(trial.id)).toBe('EXPIRED');
      expect(await status(running.id)).toBe('ACTIVE');
      expect(await status(suspended.id)).toBe('SUSPENDED');
      // Running it again finds nothing more.
      expect(await service.markExpired(new Date(), ours)).toBe(0);
      expect(await status(running.id)).toBe('ACTIVE');
    });
  });
});
