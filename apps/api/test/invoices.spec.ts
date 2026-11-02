// Step 3.3: finishing a visit creates the invoice; payments (flow.md 7, 8).
// Tenant isolation for these endpoints lives in tenancy.spec.ts (README 5.1.6).
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { type InvoiceDetail, type VisitDetail, localDate } from '@gearva/contracts';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { PlatformDb } from '../src/common/db/platform-db';
import { createTestApp } from './helpers/app';
import {
  type TestStaffGarage,
  createGarageWithOwner,
  randomPhone,
  signInAsStaff,
  staffLogin,
} from './helpers/staff';

describe('Invoices and payments', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let g: TestStaffGarage;
  let owner: string;
  let oilId: string;

  const http = () => request(app.getHttpServer());
  const as = (cookie: string) => ({
    get: (url: string) => http().get(url).set('Cookie', cookie),
    post: (url: string, body?: object) => http().post(url).set('Cookie', cookie).send(body),
  });
  const year = () => Number(localDate(new Date(), 'Asia/Beirut').slice(0, 4));

  async function newCar(garageOwner = owner) {
    const customer = (
      await as(garageOwner)
        .post('/v1/customers', { name: 'Invoice Customer', phone: randomPhone() })
        .expect(201)
    ).body;
    const plate = `I ${randomUUID().slice(0, 6)}`;
    const car = (
      await as(garageOwner)
        .post(`/v1/customers/${customer.id}/vehicles`, {
          plate,
          make: 'Kia',
          model: 'Rio',
          distanceUnit: 'KM',
          odometer: 50000,
        })
        .expect(201)
    ).body as { id: string; plate: string };
    return car;
  }

  const oil = (unitPriceCents = 4000, quantity = 1) => ({
    serviceTypeId: oilId,
    quantity,
    unitPriceCents,
    details: { brand: 'Total', grade: '10W-40' },
  });

  async function quick(extra: object, services: object[] = [oil()], cookie = owner) {
    const car = await newCar();
    return as(cookie).post('/v1/visits/quick', {
      vehicleId: car.id,
      odometer: 50100,
      services,
      ...extra,
    });
  }

  const invoiceOf = async (visit: VisitDetail, cookie = owner) =>
    (await as(cookie).get(`/v1/invoices/${visit.invoice?.id}`).expect(200)).body as InvoiceDetail;

  const seqOf = (number: string) => Number(number.split('-')[2]);

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    g = await createGarageWithOwner(app);
    ({ cookie: owner } = await staffLogin(app, g.ownerEmail, g.password));
    oilId = (
      await platform.serviceType.findFirstOrThrow({
        where: { garageId: null, code: 'OIL_CHANGE' },
      })
    ).id;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('finishing creates the invoice (flow.md 7.1)', () => {
    it('quick entry issues a numbered invoice with lines, totals and copies', async () => {
      const res = await quick({}, [
        oil(4000, 2),
        { serviceTypeId: oilId, unitPriceCents: 1500, details: { brand: 'Mobil' } },
      ]);
      expect(res.status).toBe(201);
      expect(res.body.invoice).toMatchObject({
        status: 'UNPAID',
        totalCents: 9500,
        paidCents: 0,
        remainingCents: 9500,
      });
      expect(res.body.invoice.number).toMatch(new RegExp(`^BR1-${year()}-\\d{4}$`));

      const invoice = await invoiceOf(res.body);
      expect(invoice.items).toHaveLength(2);
      expect(invoice.items[0]).toMatchObject({
        brand: 'Total',
        grade: '10W-40',
        quantity: '2.00',
        unitPriceCents: 4000,
        totalCents: 8000,
      });
      expect(invoice.customer.name).toBe('Invoice Customer');
      expect(invoice.vehicle).toMatchObject({ make: 'Kia', odometerKm: 50100 });
      expect(invoice.garage.branchCode).toBe('BR1');
      expect(invoice.nextServiceKm).toBe(55100);
    });

    it('later changes to the customer do not touch the invoice', async () => {
      const res = await quick({});
      const before = await invoiceOf(res.body);
      await platform.garageCustomer.update({
        where: { id: res.body.customer.id },
        data: { name: 'Renamed' },
      });
      expect((await invoiceOf(res.body)).customer.name).toBe(before.customer.name);
    });

    it('an unfinished visit has no invoice; finishing it later creates one', async () => {
      const open = (await quick({ finish: false })).body as VisitDetail;
      expect(open.invoice).toBeNull();
      const done = await as(owner).post(`/v1/visits/${open.id}/finish`).expect(200);
      expect(done.body.invoice.status).toBe('UNPAID');
      await as(owner).post(`/v1/visits/${open.id}/finish`).expect(409);
    });

    it('takes a discount, with VAT on the amount after it when the garage has VAT on', async () => {
      await platform.garageSettings.update({
        where: { garageId: g.garageId },
        data: { vatEnabled: true, vatRatePercent: 11 },
      });
      const res = await quick({ discount: { type: 'PERCENT', value: 10 } }, [oil(10000)]);
      await platform.garageSettings.update({
        where: { garageId: g.garageId },
        data: { vatEnabled: false, vatRatePercent: null },
      });
      expect(res.status).toBe(201);
      const invoice = await invoiceOf(res.body);
      expect(invoice).toMatchObject({
        subtotalCents: 10000,
        discountType: 'PERCENT',
        discountValue: 10,
        discountCents: 1000,
        vatCents: 990,
        totalCents: 9990,
      });
    });

    it('refuses a percent discount above 100', async () => {
      expect((await quick({ discount: { type: 'PERCENT', value: 101 } })).status).toBe(400);
    });
  });

  describe('gap-free numbers (flow.md 7.1)', () => {
    it('many visits finishing at once get consecutive numbers', async () => {
      const visits: string[] = [];
      for (let i = 0; i < 8; i += 1) {
        visits.push((await quick({ finish: false })).body.id);
      }
      const results = await Promise.all(
        visits.map((id) => as(owner).post(`/v1/visits/${id}/finish`)),
      );
      const seqs = results.map((r) => {
        expect(r.status).toBe(200);
        return seqOf(r.body.invoice.number);
      });
      const sorted = [...seqs].sort((a, b) => a - b);
      const first = sorted[0] as number;
      expect(sorted).toEqual(Array.from({ length: 8 }, (_, i) => first + i));
    });

    it('a refused finish uses no number', async () => {
      const first = (await quick({})).body as VisitDetail;
      await quick({ payment: { method: 'CASH', amountCents: 999999 } }).then((r) =>
        expect(r.status).toBe(409),
      );
      const zero = await quick({}, [oil(0)]);
      expect(zero.status).toBe(409);
      const next = (await quick({})).body as VisitDetail;
      expect(seqOf(next.invoice?.number as string)).toBe(
        seqOf(first.invoice?.number as string) + 1,
      );
    });

    it('each branch counts on its own', async () => {
      const second = (await as(owner).post('/v1/branches', { name: 'Numbers' }).expect(201)).body;
      const res = await quick({ branchId: second.id });
      expect(res.status).toBe(201);
      expect(res.body.invoice.number).toBe(`${second.code}-${year()}-0001`);
    });
  });

  describe('free work (decisions 2026-11-02)', () => {
    it('a total of 0 needs confirming, and nothing is saved until then', async () => {
      const car = await newCar();
      const body = { vehicleId: car.id, odometer: 50100, services: [oil(0)] };
      const refused = await as(owner).post('/v1/visits/quick', body).expect(409);
      expect(refused.body.code).toBe('INVOICE_TOTAL_ZERO');
      expect(await platform.visit.count({ where: { vehicleId: car.id } })).toBe(0);

      const done = await as(owner)
        .post('/v1/visits/quick', { ...body, confirmFree: true })
        .expect(201);
      expect(done.body.invoice).toMatchObject({ status: 'PAID', totalCents: 0, remainingCents: 0 });
      expect(await platform.payment.count({ where: { invoiceId: done.body.invoice.id } })).toBe(0);
    });

    it('a discount down to 0 also asks', async () => {
      const res = await quick({ discount: { type: 'PERCENT', value: 100 } });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INVOICE_TOTAL_ZERO');
    });

    it('finishing an open visit asks too', async () => {
      const open = (await quick({ finish: false }, [oil(0)])).body as VisitDetail;
      await as(owner).post(`/v1/visits/${open.id}/finish`).expect(409);
      const done = await as(owner)
        .post(`/v1/visits/${open.id}/finish`, { confirmFree: true })
        .expect(200);
      expect(done.body.invoice.status).toBe('PAID');
    });
  });

  describe('paid now (flow.md 7.1)', () => {
    it('paid in full needs no amount', async () => {
      const res = await quick({ payment: { method: 'CASH' } });
      expect(res.body.invoice).toMatchObject({
        status: 'PAID',
        paidCents: 4000,
        remainingCents: 0,
      });
      const invoice = await invoiceOf(res.body);
      expect(invoice.payments).toHaveLength(1);
      expect(invoice.payments[0]).toMatchObject({ amountCents: 4000, method: 'CASH' });
    });

    it('a part payment leaves the rest', async () => {
      const res = await quick({ payment: { method: 'WHISH', amountCents: 1500 } });
      expect(res.body.invoice).toMatchObject({
        status: 'PARTIALLY_PAID',
        paidCents: 1500,
        remainingCents: 2500,
      });
    });

    it('paying more than the total saves nothing', async () => {
      const car = await newCar();
      const res = await as(owner).post('/v1/visits/quick', {
        vehicleId: car.id,
        odometer: 50100,
        services: [oil()],
        payment: { method: 'CASH', amountCents: 4001 },
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PAYMENT_EXCEEDS_REMAINING');
      expect(await platform.visit.count({ where: { vehicleId: car.id } })).toBe(0);
    });

    it('a mechanic can take the money while finishing, and it names them', async () => {
      const { userId, cookie } = await signInAsStaff(app, g, 'MECHANIC');
      const car = await newCar();
      const res = await as(cookie)
        .post('/v1/visits/quick', {
          vehicleId: car.id,
          odometer: 50100,
          services: [oil()],
          payment: { method: 'CASH' },
        })
        .expect(201);
      const invoice = await invoiceOf(res.body, cookie);
      expect(invoice.status).toBe('PAID');
      expect(invoice.payments[0]?.receivedBy.id).toBe(userId);
      const audit = await platform.auditLog.findFirst({
        where: { action: 'payment.create', entityId: invoice.id },
      });
      expect(audit?.after).toMatchObject({ amountCents: 4000, method: 'CASH' });
    });
  });

  describe('payments later (flow.md 8.1)', () => {
    it('several payments reach PAID, and the sum always matches', async () => {
      const { invoice } = (await quick({})).body as VisitDetail;
      const pay = (amountCents: number, extra = {}) =>
        as(owner).post(`/v1/invoices/${invoice?.id}/payments`, {
          amountCents,
          method: 'CASH',
          ...extra,
        });
      expect((await pay(1000).expect(201)).body).toMatchObject({
        status: 'PARTIALLY_PAID',
        remainingCents: 3000,
      });
      const over = await pay(3001).expect(409);
      expect(over.body.code).toBe('PAYMENT_EXCEEDS_REMAINING');
      const last = await pay(3000, { note: 'The rest' }).expect(201);
      expect(last.body).toMatchObject({ status: 'PAID', paidCents: 4000, remainingCents: 0 });
      expect(last.body.payments).toHaveLength(2);

      const sum = await platform.payment.aggregate({
        where: { invoiceId: invoice?.id },
        _sum: { amountCents: true },
      });
      expect(sum._sum.amountCents).toBe(4000);
      await pay(1).expect(409);
    });

    it('two payments at the same moment cannot overpay', async () => {
      const { invoice } = (await quick({})).body as VisitDetail;
      const pay = () =>
        as(owner).post(`/v1/invoices/${invoice?.id}/payments`, {
          amountCents: 3000,
          method: 'CASH',
        });
      const statuses = (await Promise.all([pay(), pay()])).map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409]);
    });

    it('takes a past date and refuses a future one', async () => {
      const { invoice } = (await quick({})).body as VisitDetail;
      const url = `/v1/invoices/${invoice?.id}/payments`;
      const body = { amountCents: 100, method: 'CASH' };
      const past = await as(owner)
        .post(url, { ...body, date: '2026-01-15' })
        .expect(201);
      expect(past.body.payments[0].paidAt.slice(0, 10)).toBe('2026-01-15');
      await as(owner)
        .post(url, { ...body, date: '2999-01-01' })
        .expect(400);
    });

    it('a cancelled invoice takes no payment', async () => {
      const { invoice } = (await quick({})).body as VisitDetail;
      await platform.invoice.update({
        where: { id: invoice?.id },
        data: { status: 'CANCELLED', cancelReason: 'Test' },
      });
      const res = await as(owner)
        .post(`/v1/invoices/${invoice?.id}/payments`, { amountCents: 100, method: 'CASH' })
        .expect(409);
      expect(res.body.code).toBe('INVOICE_CANCELLED');
    });

    it('a receptionist can record a payment; a mechanic cannot, after finishing', async () => {
      const { invoice } = (await quick({})).body as VisitDetail;
      const url = `/v1/invoices/${invoice?.id}/payments`;
      const body = { amountCents: 100, method: 'CASH' };
      const mechanic = await signInAsStaff(app, g, 'MECHANIC');
      await as(mechanic.cookie).post(url, body).expect(403);
      const receptionist = await signInAsStaff(app, g, 'RECEPTIONIST');
      await as(receptionist.cookie).post(url, body).expect(201);
      const audit = await platform.auditLog.findFirst({
        where: { action: 'payment.create', entityId: invoice?.id },
      });
      expect(audit).not.toBeNull();
    });

    it('staff of one branch cannot reach another branch invoice', async () => {
      const second = (await as(owner).post('/v1/branches', { name: 'Elsewhere' }).expect(201)).body;
      const res = await quick({ branchId: second.id });
      const { cookie } = await signInAsStaff(app, g, 'RECEPTIONIST');
      await as(cookie).get(`/v1/invoices/${res.body.invoice.id}`).expect(404);
      await as(cookie)
        .post(`/v1/invoices/${res.body.invoice.id}/payments`, { amountCents: 100, method: 'CASH' })
        .expect(404);
    });
  });
});
