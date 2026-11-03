// Step 3.4: edit, cancel, reissue, debt list, income summary, settings (flow.md 7.5, 8.2, 8.3).
// Tenant isolation for these endpoints lives in tenancy.spec.ts (README 5.1.6).
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { DebtItem, InvoiceDetail, VisitDetail } from '@gearva/contracts';
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

describe('Changing invoices, debts and income', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let g: TestStaffGarage;
  let owner: string;
  let oilId: string;

  const http = () => request(app.getHttpServer());
  const as = (cookie: string) => ({
    get: (url: string) => http().get(url).set('Cookie', cookie),
    post: (url: string, body?: object) => http().post(url).set('Cookie', cookie).send(body),
    patch: (url: string, body: object) => http().patch(url).set('Cookie', cookie).send(body),
  });

  async function newCar(cookie = owner) {
    const customer = (
      await as(cookie)
        .post('/v1/customers', { name: 'Debt Customer', phone: randomPhone() })
        .expect(201)
    ).body;
    const car = (
      await as(cookie)
        .post(`/v1/customers/${customer.id}/vehicles`, {
          plate: `C ${randomUUID().slice(0, 6)}`,
          make: 'Kia',
          model: 'Rio',
          distanceUnit: 'KM',
          odometer: 50000,
        })
        .expect(201)
    ).body as { id: string };
    return { car, customerId: customer.id as string };
  }

  /** A finished visit of 40.00 and its invoice. */
  async function invoice(extra: object = {}, cookie = owner, garageOwner = owner) {
    const { car } = await newCar(garageOwner);
    const res = await as(cookie)
      .post('/v1/visits/quick', {
        vehicleId: car.id,
        odometer: 50100,
        services: [{ serviceTypeId: oilId, unitPriceCents: 4000 }],
        ...extra,
      })
      .expect(201);
    const visit = res.body as VisitDetail;
    const id = visit.invoice?.id as string;
    const detail = (await as(cookie).get(`/v1/invoices/${id}`).expect(200)).body as InvoiceDetail;
    return { id, visit, detail, lineId: detail.items[0]?.id as string };
  }

  /** Moves an invoice to an earlier day, as if it was issued then. */
  const ageInvoice = (id: string) =>
    platform.invoice.update({
      where: { id },
      data: { issuedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    });

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

  describe('what a visit shows', () => {
    it('keeps the cancelled invoice until a new one replaces it', async () => {
      const { id, visit } = await invoice();
      await as(owner).post(`/v1/invoices/${id}/cancel`, { reason: 'Wrong car' }).expect(200);
      const cancelled = await as(owner).get(`/v1/visits/${visit.id}`).expect(200);
      expect(cancelled.body.invoice).toMatchObject({ id, status: 'CANCELLED' });

      const next = await as(owner).post(`/v1/invoices/${id}/reissue`, {}).expect(201);
      const reissued = await as(owner).get(`/v1/visits/${visit.id}`).expect(200);
      expect(reissued.body.invoice).toMatchObject({ id: next.body.id, status: 'UNPAID' });
    });

    it('gives the rate only when the garage has VAT on', async () => {
      const { visit } = await invoice();
      expect(visit.vatRatePercent).toBeNull();
      await as(owner)
        .patch('/v1/invoice-settings', { vatEnabled: true, vatRatePercent: '11' })
        .expect(200);
      const res = await as(owner).get(`/v1/visits/${visit.id}`).expect(200);
      expect(Number(res.body.vatRatePercent)).toBe(11);
      await as(owner).patch('/v1/invoice-settings', { vatEnabled: false }).expect(200);
    });
  });

  describe('editing (flow.md 7.5)', () => {
    it('recalculates totals, moves the service record and logs before and after', async () => {
      const { id, lineId, visit } = await invoice();
      const res = await as(owner)
        .patch(`/v1/invoices/${id}`, {
          items: [{ id: lineId, quantity: 2, unitPriceCents: 5000 }],
          discount: { type: 'AMOUNT', value: 1000 },
        })
        .expect(200);
      expect(res.body).toMatchObject({
        subtotalCents: 10000,
        discountCents: 1000,
        totalCents: 9000,
        remainingCents: 9000,
      });
      expect(res.body.items[0]).toMatchObject({ quantity: '2.00', totalCents: 10000 });

      const record = await platform.serviceRecord.findFirstOrThrow({
        where: { visitId: visit.id },
      });
      expect(record.totalCents).toBe(10000);

      const audit = await platform.auditLog.findFirstOrThrow({
        where: { action: 'invoice.edit', entityId: id },
      });
      expect(audit.before).toMatchObject({ totalCents: 4000 });
      expect(audit.after).toMatchObject({ totalCents: 9000 });
    });

    it('a total below what was paid is refused; a raise makes it part paid', async () => {
      const { id, lineId } = await invoice({ payment: { method: 'CASH' } });
      const low = await as(owner)
        .patch(`/v1/invoices/${id}`, { items: [{ id: lineId, unitPriceCents: 3000 }] })
        .expect(409);
      expect(low.body.code).toBe('INVOICE_TOTAL_BELOW_PAID');
      const high = await as(owner)
        .patch(`/v1/invoices/${id}`, { items: [{ id: lineId, unitPriceCents: 5000 }] })
        .expect(200);
      expect(high.body).toMatchObject({ status: 'PARTIALLY_PAID', remainingCents: 1000 });
    });

    it('a total of 0 needs confirming', async () => {
      const { id, lineId } = await invoice();
      const body = { items: [{ id: lineId, unitPriceCents: 0 }] };
      const refused = await as(owner).patch(`/v1/invoices/${id}`, body).expect(409);
      expect(refused.body.code).toBe('INVOICE_TOTAL_ZERO');
      const done = await as(owner)
        .patch(`/v1/invoices/${id}`, { ...body, confirmFree: true })
        .expect(200);
      expect(done.body.status).toBe('PAID');
    });

    it('refuses a line of another invoice', async () => {
      const one = await invoice();
      const other = await invoice();
      await as(owner)
        .patch(`/v1/invoices/${one.id}`, {
          items: [{ id: other.lineId, unitPriceCents: 100 }],
        })
        .expect(400);
    });

    it('keeps the rate of the invoice when the garage changes VAT later', async () => {
      await as(owner)
        .patch('/v1/invoice-settings', { vatEnabled: true, vatRatePercent: '11' })
        .expect(200);
      const { id, lineId, detail } = await invoice();
      expect(detail.vatCents).toBe(440);
      await as(owner).patch('/v1/invoice-settings', { vatRatePercent: '20' }).expect(200);
      const res = await as(owner)
        .patch(`/v1/invoices/${id}`, { items: [{ id: lineId, unitPriceCents: 5000 }] })
        .expect(200);
      await as(owner)
        .patch('/v1/invoice-settings', { vatEnabled: false, vatRatePercent: null })
        .expect(200);
      expect(res.body.vatCents).toBe(550);
    });

    it('after the day of issue, only the owner can edit', async () => {
      const { id, lineId } = await invoice();
      await ageInvoice(id);
      const manager = await signInAsStaff(app, g, 'MANAGER');
      const body = { items: [{ id: lineId, unitPriceCents: 4500 }] };
      const closed = await as(manager.cookie).patch(`/v1/invoices/${id}`, body).expect(403);
      expect(closed.body.code).toBe('INVOICE_EDIT_WINDOW_CLOSED');
      await as(owner).patch(`/v1/invoices/${id}`, body).expect(200);
    });

    it('a mechanic edits only their own visits; a receptionist never', async () => {
      const mechanic = await signInAsStaff(app, g, 'MECHANIC');
      const own = await invoice({}, mechanic.cookie);
      const others = await invoice({ branchId: g.branchId });
      await as(mechanic.cookie)
        .patch(`/v1/invoices/${own.id}`, { items: [{ id: own.lineId, unitPriceCents: 4500 }] })
        .expect(200);
      await as(mechanic.cookie)
        .patch(`/v1/invoices/${others.id}`, {
          items: [{ id: others.lineId, unitPriceCents: 4500 }],
        })
        .expect(403);
      const receptionist = await signInAsStaff(app, g, 'RECEPTIONIST');
      await as(receptionist.cookie)
        .patch(`/v1/invoices/${own.id}`, { items: [{ id: own.lineId, unitPriceCents: 4500 }] })
        .expect(403);
    });
  });

  describe('cancelling and reissuing (flow.md 7.5)', () => {
    it('needs a reason, keeps the number, and takes no more changes', async () => {
      const { id, lineId, detail } = await invoice();
      await as(owner).post(`/v1/invoices/${id}/cancel`, {}).expect(400);
      const res = await as(owner)
        .post(`/v1/invoices/${id}/cancel`, { reason: 'Wrong car' })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'CANCELLED',
        number: detail.number,
        cancelReason: 'Wrong car',
      });
      await as(owner).post(`/v1/invoices/${id}/cancel`, { reason: 'Again' }).expect(409);
      await as(owner)
        .patch(`/v1/invoices/${id}`, { items: [{ id: lineId, unitPriceCents: 1 }] })
        .expect(409);
    });

    it('a mechanic or receptionist cannot cancel', async () => {
      const { id } = await invoice();
      for (const role of ['MECHANIC', 'RECEPTIONIST'] as const) {
        const { cookie } = await signInAsStaff(app, g, role);
        await as(cookie).post(`/v1/invoices/${id}/cancel`, { reason: 'No' }).expect(403);
      }
    });

    it('a reissue takes the next number and points back; only once', async () => {
      const { id, detail, visit } = await invoice({ payment: { method: 'CASH' } });
      const early = await as(owner).post(`/v1/invoices/${id}/reissue`).expect(409);
      expect(early.body.code).toBe('INVOICE_NOT_CANCELLED');
      await as(owner).post(`/v1/invoices/${id}/cancel`, { reason: 'Wrong price' }).expect(200);

      const res = await as(owner).post(`/v1/invoices/${id}/reissue`).expect(201);
      expect(res.body.number).not.toBe(detail.number);
      expect(res.body).toMatchObject({
        replacesInvoiceId: id,
        status: 'UNPAID',
        paidCents: 0,
        totalCents: 4000,
      });
      const current = await as(owner).get(`/v1/visits/${visit.id}`).expect(200);
      expect(current.body.invoice.id).toBe(res.body.id);

      const again = await as(owner).post(`/v1/invoices/${id}/reissue`).expect(409);
      expect(again.body.code).toBe('INVOICE_ALREADY_REISSUED');
    });

    it('money on a cancelled invoice shows as refund needed', async () => {
      const { id } = await invoice({ payment: { method: 'CASH', amountCents: 1200 } });
      await as(owner).post(`/v1/invoices/${id}/cancel`, { reason: 'Mistake' }).expect(200);
      const list = await as(owner).get('/v1/invoices?refundNeeded=true').expect(200);
      expect(list.body.items.map((i: { id: string }) => i.id)).toContain(id);
    });
  });

  describe('debt list (flow.md 8.2)', () => {
    it('groups by customer, largest first, without paid or cancelled invoices', async () => {
      const garage = await createGarageWithOwner(app);
      const { cookie } = await staffLogin(app, garage.ownerEmail, garage.password);
      const small = await invoice({}, cookie, cookie);
      const { car, customerId } = await newCar(cookie);
      for (const odometer of [50100, 50200]) {
        await as(cookie)
          .post('/v1/visits/quick', {
            vehicleId: car.id,
            odometer,
            services: [{ serviceTypeId: oilId, unitPriceCents: 3000 }],
            payment: { method: 'CASH', amountCents: 500 },
          })
          .expect(201);
      }
      await invoice({ payment: { method: 'CASH' } }, cookie, cookie);
      const cancelled = await invoice({}, cookie, cookie);
      await as(cookie)
        .post(`/v1/invoices/${cancelled.id}/cancel`, { reason: 'Mistake' })
        .expect(200);

      const res = await as(cookie).get('/v1/debts').expect(200);
      const items = res.body.items as DebtItem[];
      expect(res.body.total).toBe(2);
      expect(items[0]).toMatchObject({ customer: { id: customerId }, remainingCents: 5000 });
      expect(items[0]?.invoices).toHaveLength(2);
      expect(items[1]?.remainingCents).toBe(4000);
      expect(items[1]?.invoices[0]?.id).toBe(small.id);
    });

    it('a receptionist sees it; a mechanic does not', async () => {
      const receptionist = await signInAsStaff(app, g, 'RECEPTIONIST');
      await as(receptionist.cookie).get('/v1/debts').expect(200);
      const mechanic = await signInAsStaff(app, g, 'MECHANIC');
      await as(mechanic.cookie).get('/v1/debts').expect(403);
      await as(mechanic.cookie).get('/v1/invoices').expect(403);
    });
  });

  describe('income summary (flow.md 8.3)', () => {
    it('separates received from invoiced, and counts the day of the money', async () => {
      const garage = await createGarageWithOwner(app);
      const { cookie } = await staffLogin(app, garage.ownerEmail, garage.password);
      await invoice({}, cookie, cookie); // invoiced 40, received 0
      await invoice({ payment: { method: 'CASH', amountCents: 1500 } }, cookie, cookie);
      const cancelled = await invoice({ payment: { method: 'WHISH' } }, cookie, cookie);
      await as(cookie).post(`/v1/invoices/${cancelled.id}/cancel`, { reason: 'Oops' }).expect(200);

      const res = await as(cookie).get('/v1/income').expect(200);
      expect(res.body.today).toEqual({ receivedCents: 5500, invoicedCents: 8000 });
      expect(res.body.month).toEqual({ receivedCents: 5500, invoicedCents: 8000 });
      expect(res.body.refundNeededCents).toBe(4000);
    });

    it('a late payment counts when it came in, not when the invoice was issued', async () => {
      const garage = await createGarageWithOwner(app);
      const { cookie } = await staffLogin(app, garage.ownerEmail, garage.password);
      const { id } = await invoice({}, cookie, cookie);
      await platform.invoice.update({
        where: { id },
        data: { issuedAt: new Date('2020-01-15T10:00:00Z') },
      });
      await as(cookie)
        .post(`/v1/invoices/${id}/payments`, { amountCents: 4000, method: 'CASH' })
        .expect(201);
      const res = await as(cookie).get('/v1/income').expect(200);
      expect(res.body.today).toEqual({ receivedCents: 4000, invoicedCents: 0 });
    });

    it('is for owners and managers only', async () => {
      const manager = await signInAsStaff(app, g, 'MANAGER');
      await as(manager.cookie).get('/v1/income').expect(200);
      for (const role of ['MECHANIC', 'RECEPTIONIST'] as const) {
        const { cookie } = await signInAsStaff(app, g, role);
        await as(cookie).get('/v1/income').expect(403);
      }
    });
  });

  describe('invoice settings', () => {
    it('owner only; a number format must hold branch, year and sequence', async () => {
      const res = await as(owner)
        .patch('/v1/invoice-settings', {
          invoiceNumberFormat: 'INV/{YYYY}/{BRANCH}/{SEQ:5}',
          termsText: 'Parts are guaranteed for 30 days.',
        })
        .expect(200);
      expect(res.body.invoiceNumberFormat).toBe('INV/{YYYY}/{BRANCH}/{SEQ:5}');
      const { detail } = await invoice();
      expect(detail.number).toMatch(/^INV\/\d{4}\/BR1\/\d{5}$/);
      expect(detail.terms).toBe('Parts are guaranteed for 30 days.');

      await as(owner).patch('/v1/invoice-settings', { invoiceNumberFormat: '{SEQ:4}' }).expect(400);
      await as(owner)
        .patch('/v1/invoice-settings', { invoiceNumberFormat: '{BRANCH}-{YYYY}-{SEQ:4}' })
        .expect(200);

      const manager = await signInAsStaff(app, g, 'MANAGER');
      await as(manager.cookie).get('/v1/invoice-settings').expect(403);
      await as(manager.cookie).patch('/v1/invoice-settings', { termsText: 'x' }).expect(403);
    });

    it('VAT needs a rate before it can be on', async () => {
      await as(owner).patch('/v1/invoice-settings', { vatEnabled: true }).expect(400);
      await as(owner).patch('/v1/invoice-settings', { vatRatePercent: '101' }).expect(400);
    });
  });
});
