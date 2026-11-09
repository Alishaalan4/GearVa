// Step 4.4: the reminder API (flow.md 9.4, 9.5): the customer email, the WhatsApp list
// and "mark as sent", the notification log and the reminder settings, with their roles.
// Tenant isolation for these endpoints lives in tenancy.spec.ts (README 5.1.6).
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { DueReminderItem, NotificationLogItem } from '@gearva/contracts';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { PlatformDb } from '../src/common/db/platform-db';
import { RemindersService } from '../src/reminders/reminders.service';
import { createTestApp } from './helpers/app';
import { waitFor } from './helpers/garages';
import {
  type TestStaffGarage,
  createGarageWithOwner,
  randomPhone,
  signInAsStaff,
  staffLogin,
} from './helpers/staff';

/** A fixed-offset zone whose clock now shows about `hour` o'clock. */
function zoneAt(hour: number): string {
  let offset = (((hour - new Date().getUTCHours()) % 24) + 24) % 24;
  if (offset > 12) offset -= 24;
  return offset === 0 ? 'Etc/GMT' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
}

describe('Reminder API', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let reminders: RemindersService;
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
    patch: (url: string, body: object) =>
      request(app.getHttpServer()).patch(url).set('Cookie', cookie).send(body),
  });

  /** A customer, a car and a due oil-change reminder (moved to 400 km after the reading). */
  async function dueCar(email?: string) {
    const phone = randomPhone();
    const customer = (
      await as(owner)
        .post('/v1/customers', { name: 'Nadim', phone, ...(email ? { email } : {}) })
        .expect(201)
    ).body as { id: string; email: string | null };
    const car = (
      await as(owner)
        .post(`/v1/customers/${customer.id}/vehicles`, {
          plate: `N ${randomUUID().slice(0, 6)}`,
          make: 'Kia',
          model: 'Rio',
          distanceUnit: 'KM',
          odometer: 50_000,
        })
        .expect(201)
    ).body as { id: string };
    await as(owner)
      .post('/v1/visits/quick', {
        vehicleId: car.id,
        odometer: 50_100,
        services: [{ serviceTypeId: oilId, unitPriceCents: 4000 }],
      })
      .expect(201);
    const reminder = await platform.reminder.findFirstOrThrow({
      where: { vehicleId: car.id, kind: 'SERVICE_DUE' },
    });
    await platform.reminder.update({ where: { id: reminder.id }, data: { nextDueKm: 50_400 } });
    return { reminderId: reminder.id, customer, phone };
  }

  async function dueList(cookie = owner): Promise<DueReminderItem[]> {
    const res = await as(cookie).get('/v1/reminders/due?pageSize=50').expect(200);
    return res.body.items as DueReminderItem[];
  }

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    reminders = app.get(RemindersService);
    g = await createGarageWithOwner(app);
    ({ cookie: owner } = await staffLogin(app, g.ownerEmail, g.password));
    ({ cookie: manager } = await signInAsStaff(app, g, 'MANAGER'));
    ({ cookie: mechanic } = await signInAsStaff(app, g, 'MECHANIC'));
    ({ cookie: receptionist } = await signInAsStaff(app, g, 'RECEPTIONIST'));
    await platform.garage.update({ where: { id: g.garageId }, data: { timezone: zoneAt(13) } });
    oilId = (
      await platform.serviceType.findFirstOrThrow({
        where: { garageId: null, code: 'OIL_CHANGE' },
      })
    ).id;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('customer email', () => {
    it('is saved lower case, changed, and cleared with an empty field', async () => {
      const { customer } = await dueCar(' Nadim@Mail.COM ');
      expect(customer.email).toBe('nadim@mail.com');
      const changed = await as(owner)
        .patch(`/v1/customers/${customer.id}`, { email: 'new@mail.com' })
        .expect(200);
      expect(changed.body.email).toBe('new@mail.com');
      const cleared = await as(owner)
        .patch(`/v1/customers/${customer.id}`, { email: '' })
        .expect(200);
      expect(cleared.body.email).toBeNull();
    });

    it('refuses an address that is not an email', async () => {
      const { customer } = await dueCar();
      await as(owner).patch(`/v1/customers/${customer.id}`, { email: 'not-an-email' }).expect(400);
    });
  });

  describe('WhatsApp list', () => {
    it('lists a due reminder without email, with the message ready in WhatsApp', async () => {
      const { reminderId, phone } = await dueCar();
      const item = (await dueList()).find((d) => d.reminderId === reminderId);
      expect(item).toMatchObject({
        round: 1,
        kind: 'SERVICE_DUE',
        dueKm: 50_400,
        emailFailed: false,
        serviceName: { en: expect.any(String), ar: expect.any(String) },
      });
      const url = new URL(item?.whatsappUrl ?? '');
      expect(url.origin + url.pathname).toBe(`https://wa.me/${phone.replace(/\D/g, '')}`);
      expect(url.searchParams.get('text')).toContain('50,400');
    });

    it('leaves out a customer with an email, unless that email failed', async () => {
      const { reminderId } = await dueCar(`ok-${randomUUID()}@test.local`);
      expect((await dueList()).map((d) => d.reminderId)).not.toContain(reminderId);

      // The scan sends the email; then make it as if it had failed.
      await reminders.inGarage(g.garageId, () => reminders.scanGarage());
      const email = await waitFor(() =>
        platform.notification.findFirst({
          where: { refId: reminderId, channel: 'EMAIL', status: 'SENT' },
        }),
      );
      expect((await dueList()).map((d) => d.reminderId)).not.toContain(reminderId);

      // A failed email of the next round puts it on the list.
      await platform.reminder.update({
        where: { id: reminderId },
        data: { lastNotifiedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
      });
      await platform.notification.create({
        data: {
          garageId: g.garageId,
          channel: 'EMAIL',
          type: 'SERVICE_REMINDER',
          template: 'service-reminder',
          locale: 'en',
          recipient: email.recipient,
          payload: {},
          status: 'FAILED',
          error: 'Address rejected',
          dedupeKey: `REMINDER:${reminderId}:2:EMAIL`,
          refType: 'reminder',
          refId: reminderId,
        },
      });
      const item = (await dueList()).find((d) => d.reminderId === reminderId);
      expect(item).toMatchObject({ round: 2, emailFailed: true });
    });

    it('mark as sent counts the round once, logs it, and takes it off the list', async () => {
      const { reminderId, phone } = await dueCar();
      const first = await as(receptionist)
        .post(`/v1/reminders/${reminderId}/whatsapp-sent`, { round: 1 })
        .expect(200);
      expect(first.body).toEqual({ id: reminderId, round: 1, counted: true });
      const again = await as(owner)
        .post(`/v1/reminders/${reminderId}/whatsapp-sent`, { round: 1 })
        .expect(200);
      expect(again.body.counted).toBe(false);

      expect(
        await platform.reminder.findUniqueOrThrow({ where: { id: reminderId } }),
      ).toMatchObject({ status: 'SENT', notifyCount: 1 });
      const rows = await platform.notification.findMany({ where: { refId: reminderId } });
      expect(rows).toEqual([
        expect.objectContaining({
          channel: 'WHATSAPP',
          status: 'SENT',
          recipient: phone,
          dedupeKey: `REMINDER:${reminderId}:1:WHATSAPP`,
        }),
      ]);
      expect((await dueList()).map((d) => d.reminderId)).not.toContain(reminderId);
      // Who sent it is in the audit log.
      expect(
        await platform.auditLog.count({
          where: { action: 'reminder.whatsapp_sent', entityId: reminderId },
        }),
      ).toBe(2);
    });

    it('a round that is not next is refused', async () => {
      const { reminderId } = await dueCar();
      const res = await as(owner)
        .post(`/v1/reminders/${reminderId}/whatsapp-sent`, { round: 2 })
        .expect(409);
      expect(res.body.code).toBe('REMINDER_NOT_DUE');
    });

    it('is for the owner, managers and receptionists, not mechanics', async () => {
      const { reminderId } = await dueCar();
      await as(manager).get('/v1/reminders/due').expect(200);
      await as(receptionist).get('/v1/reminders/due').expect(200);
      await as(mechanic).get('/v1/reminders/due').expect(403);
      await as(mechanic)
        .post(`/v1/reminders/${reminderId}/whatsapp-sent`, { round: 1 })
        .expect(403);
    });
  });

  describe('notification log', () => {
    it('shows each message with who it was for, and never its content', async () => {
      const { reminderId, customer } = await dueCar();
      await as(owner).post(`/v1/reminders/${reminderId}/whatsapp-sent`, { round: 1 }).expect(200);
      const res = await as(manager)
        .get('/v1/notifications?channel=WHATSAPP&pageSize=50')
        .expect(200);
      const items = res.body.items as NotificationLogItem[];
      expect(items.every((n) => n.channel === 'WHATSAPP')).toBe(true);
      const row = items.find((n) => n.to?.id === customer.id);
      expect(row).toMatchObject({
        type: 'SERVICE_REMINDER',
        status: 'SENT',
        to: { kind: 'customer', name: 'Nadim' },
      });
      expect(Object.keys(row ?? {})).not.toContain('payload');

      // Staff invites show the staff member, without the sign-in link.
      const all = await as(owner).get('/v1/notifications?pageSize=50').expect(200);
      expect(JSON.stringify(all.body)).not.toContain('set-password');
    });

    it('filters by status, and is for the owner and managers only', async () => {
      const res = await as(owner).get('/v1/notifications?status=SKIPPED').expect(200);
      expect((res.body.items as NotificationLogItem[]).every((n) => n.status === 'SKIPPED')).toBe(
        true,
      );
      await as(receptionist).get('/v1/notifications').expect(403);
      await as(mechanic).get('/v1/notifications').expect(403);
    });
  });

  describe('reminder settings', () => {
    it('the owner reads and changes them; nobody else', async () => {
      const res = await as(owner).get('/v1/reminder-settings').expect(200);
      expect(res.body).toEqual({
        reminderLeadKm: 500,
        reminderLeadDays: 7,
        monthlyReminderEnabled: false,
      });
      const changed = await as(owner)
        .patch('/v1/reminder-settings', { reminderLeadKm: 800, monthlyReminderEnabled: true })
        .expect(200);
      expect(changed.body).toMatchObject({ reminderLeadKm: 800, monthlyReminderEnabled: true });
      await as(owner).patch('/v1/reminder-settings', { reminderLeadKm: -1 }).expect(400);
      await as(owner)
        .patch('/v1/reminder-settings', { reminderLeadKm: 500, monthlyReminderEnabled: false })
        .expect(200);
      await as(manager).get('/v1/reminder-settings').expect(403);
      await as(manager).patch('/v1/reminder-settings', { reminderLeadKm: 1 }).expect(403);
    });
  });
});
