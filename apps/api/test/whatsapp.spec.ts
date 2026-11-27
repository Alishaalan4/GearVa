// Step 7.10: "Message on WhatsApp" (flow.md 9.7): the ready messages in the customer's
// language, which ones fit, the log row and the audit row, and the roles.
// Tenant isolation for these endpoints lives in tenancy.spec.ts (README 5.1.6).
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { VisitDetail, WhatsappMessages } from '@gearva/contracts';
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

describe('WhatsApp messages', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let g: TestStaffGarage;
  let owner: string;
  let manager: string;
  let mechanic: string;
  let receptionist: string;
  let oilId: string;

  const as = (cookie: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('Cookie', cookie),
    post: (url: string, body?: object) =>
      request(app.getHttpServer()).post(url).set('Cookie', cookie).send(body),
  });

  /** A customer with a Kia Rio and one finished visit (oil change, $40), paid or not. */
  async function customerWithVisit(paid: boolean) {
    const phone = randomPhone();
    const customer = (await as(owner).post('/v1/customers', { name: 'Nadim', phone }).expect(201))
      .body as { id: string };
    const plate = `N ${randomUUID().slice(0, 6)}`;
    const car = (
      await as(owner)
        .post(`/v1/customers/${customer.id}/vehicles`, {
          plate,
          make: 'Kia',
          model: 'Rio',
          distanceUnit: 'KM',
          odometer: 50_000,
        })
        .expect(201)
    ).body as { id: string };
    const visit = (
      await as(owner)
        .post('/v1/visits/quick', {
          vehicleId: car.id,
          odometer: 50_100,
          services: [{ serviceTypeId: oilId, unitPriceCents: 4000 }],
          ...(paid ? { payment: { method: 'CASH' } } : {}),
        })
        .expect(201)
    ).body as VisitDetail;
    return { customerId: customer.id, phone, plate, visitId: visit.id };
  }

  const messages = async (customerId: string, visitId?: string, cookie = owner) =>
    (
      await as(cookie)
        .get(`/v1/customers/${customerId}/whatsapp${visitId ? `?visitId=${visitId}` : ''}`)
        .expect(200)
    ).body as WhatsappMessages;

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    g = await createGarageWithOwner(app);
    ({ cookie: owner } = await staffLogin(app, g.ownerEmail, g.password));
    ({ cookie: manager } = await signInAsStaff(app, g, 'MANAGER'));
    ({ cookie: mechanic } = await signInAsStaff(app, g, 'MECHANIC'));
    ({ cookie: receptionist } = await signInAsStaff(app, g, 'RECEPTIONIST'));
    oilId = (
      await platform.serviceType.findFirstOrThrow({
        where: { garageId: null, code: 'OIL_CHANGE' },
      })
    ).id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('a visit with an unpaid invoice gets every message, in the customer language', async () => {
    const { customerId, phone, plate, visitId } = await customerWithVisit(false);
    await platform.owner.update({ where: { phone }, data: { locale: 'ar' } });
    const m = await messages(customerId, visitId);
    expect(m.phone).toBe(phone.replace(/\D/g, ''));
    expect(m.locale).toBe('ar');
    expect(m.messages[0]?.text).toContain('مرحباً Nadim');
    expect(m.messages.map((x) => x.template)).toEqual([
      'CAR_READY',
      'INVOICE_READY',
      'PAYMENT_DUE',
      'SERVICE_DUE',
      'THANK_YOU',
      'FREE',
    ]);
    const text = (t: string) => m.messages.find((x) => x.template === t)?.text ?? '';
    expect(text('CAR_READY')).toContain(`Kia Rio (${plate})`);
    expect(text('INVOICE_READY')).toContain('$40.00');
    expect(text('PAYMENT_DUE')).toContain('$40.00');
    expect(text('FREE')).toContain('Nadim');
  });

  it('English for a customer who chose English; nothing owed = no payment message', async () => {
    const { customerId, phone, visitId } = await customerWithVisit(true);
    await platform.owner.update({ where: { phone }, data: { locale: 'en' } });
    const m = await messages(customerId, visitId);
    expect(m.locale).toBe('en');
    expect(m.messages.map((x) => x.template)).not.toContain('PAYMENT_DUE');
    expect(m.messages.find((x) => x.template === 'INVOICE_READY')?.text).toContain('fully paid');
  });

  it('without a visit: no car or invoice message; no service reminder after an opt-out', async () => {
    const { customerId } = await customerWithVisit(false);
    expect((await messages(customerId)).messages.map((x) => x.template)).toEqual([
      'PAYMENT_DUE',
      'SERVICE_DUE',
      'THANK_YOU',
      'FREE',
    ]);
    await platform.garageCustomer.update({
      where: { id: customerId },
      data: { remindersOptOut: true },
    });
    expect((await messages(customerId)).messages.map((x) => x.template)).not.toContain(
      'SERVICE_DUE',
    );
  });

  it('logs each opening as a SENT WhatsApp row, never the text, with an audit row', async () => {
    const { customerId, phone, visitId } = await customerWithVisit(false);
    const res = await as(receptionist)
      .post(`/v1/customers/${customerId}/whatsapp-sent`, { template: 'CAR_READY', visitId })
      .expect(200);
    expect(res.body.id).toBe(customerId);
    await as(receptionist)
      .post(`/v1/customers/${customerId}/whatsapp-sent`, { template: 'THANK_YOU' })
      .expect(200);
    const rows = await platform.notification.findMany({
      where: { garageId: g.garageId, channel: 'WHATSAPP', status: 'SENT', recipient: phone },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toEqual([
      expect.objectContaining({
        id: res.body.notificationId,
        type: 'CAR_READY',
        status: 'SENT',
        refType: 'visit',
        refId: visitId,
        payload: { template: 'CAR_READY' },
      }),
      expect.objectContaining({ type: 'MESSAGE', refType: 'customer', refId: customerId }),
    ]);
    expect(
      await platform.auditLog.count({
        where: { action: 'customer.whatsapp_message', entityId: customerId },
      }),
    ).toBe(2);
  });

  it('refuses a message that does not fit, and a visit of another customer', async () => {
    const paid = await customerWithVisit(true);
    const other = await customerWithVisit(false);
    await as(owner)
      .post(`/v1/customers/${paid.customerId}/whatsapp-sent`, { template: 'PAYMENT_DUE' })
      .expect(400);
    await as(owner)
      .post(`/v1/customers/${paid.customerId}/whatsapp-sent`, { template: 'CAR_READY' })
      .expect(400);
    await as(owner)
      .get(`/v1/customers/${paid.customerId}/whatsapp?visitId=${other.visitId}`)
      .expect(404);
    await as(owner)
      .post(`/v1/customers/${paid.customerId}/whatsapp-sent`, {
        template: 'CAR_READY',
        visitId: other.visitId,
      })
      .expect(404);
  });

  it('is for the owner, managers and receptionists, not mechanics', async () => {
    const { customerId } = await customerWithVisit(false);
    await messages(customerId, undefined, manager);
    await messages(customerId, undefined, receptionist);
    await as(mechanic).get(`/v1/customers/${customerId}/whatsapp`).expect(403);
    await as(mechanic)
      .post(`/v1/customers/${customerId}/whatsapp-sent`, { template: 'FREE' })
      .expect(403);
  });
});
