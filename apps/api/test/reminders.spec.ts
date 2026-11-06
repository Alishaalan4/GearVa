// Step 4.3: the reminder scan (flow.md 9.1-9.3) with the real queue, worker and console
// email: one email per round, follow-ups, opt-outs, daytime only, the monthly reminder.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
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
  staffLogin,
} from './helpers/staff';

/** A fixed-offset zone whose clock now shows about `hour` o'clock. */
function zoneAt(hour: number): string {
  let offset = (((hour - new Date().getUTCHours()) % 24) + 24) % 24;
  if (offset > 12) offset -= 24;
  // Etc zones have the sign reversed: Etc/GMT-3 is UTC+3.
  return offset === 0 ? 'Etc/GMT' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
}

describe('Reminder scan', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let reminders: RemindersService;
  let g: TestStaffGarage;
  let owner: string;
  let oilId: string;

  const as = (cookie: string) => ({
    post: (url: string, body?: object) =>
      request(app.getHttpServer()).post(url).set('Cookie', cookie).send(body),
  });

  const scan = () => reminders.inGarage(g.garageId, () => reminders.scanGarage());

  /**
   * A customer (with an email unless `email` is null), a car and an oil change whose
   * reminder is due now: the change is moved to 400 km after the car's last reading.
   */
  async function dueCar({ email = `c-${randomUUID()}@test.local` as string | null } = {}) {
    const customer = (
      await as(owner).post('/v1/customers', { name: 'Rami', phone: randomPhone() }).expect(201)
    ).body as { id: string };
    await platform.garageCustomer.update({ where: { id: customer.id }, data: { email } });
    const car = (
      await as(owner)
        .post(`/v1/customers/${customer.id}/vehicles`, {
          plate: `R ${randomUUID().slice(0, 6)}`,
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
    return { reminderId: reminder.id, customerId: customer.id, carId: car.id };
  }

  const reminderEmails = (reminderId: string) =>
    platform.notification.findMany({ where: { refType: 'reminder', refId: reminderId } });

  /** Waits until the reminder's round `round` was counted (the email was SENT). */
  const counted = (reminderId: string, round: number) =>
    waitFor(() =>
      platform.reminder.findFirst({
        where: { id: reminderId, status: 'SENT', notifyCount: round },
      }),
    );

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    reminders = app.get(RemindersService);
    g = await createGarageWithOwner(app);
    ({ cookie: owner } = await staffLogin(app, g.ownerEmail, g.password));
    // Midday in the garage, whatever time the tests run.
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

  it('emails a due reminder once, and counts the round when it is sent', async () => {
    const { reminderId } = await dueCar();
    await scan();
    const row = await counted(reminderId, 1);
    expect(row.lastNotifiedAt).toBeInstanceOf(Date);

    const [email] = await reminderEmails(reminderId);
    expect(email).toMatchObject({
      channel: 'EMAIL',
      type: 'SERVICE_REMINDER',
      template: 'service-reminder',
      status: 'SENT',
      dedupeKey: `REMINDER:${reminderId}:1:EMAIL`,
    });
    expect(email?.payload).toMatchObject({ round: 1, dueKm: 50_400, unit: 'KM' });

    // The next hourly scans send nothing more.
    await scan();
    await scan();
    expect(await reminderEmails(reminderId)).toHaveLength(1);
  });

  it('two scans at the same moment still send one email', async () => {
    const { reminderId } = await dueCar();
    await Promise.all([scan(), scan(), scan()]);
    await counted(reminderId, 1);
    expect(await reminderEmails(reminderId)).toHaveLength(1);
  });

  it('a reminder not yet due sends nothing', async () => {
    const { reminderId } = await dueCar();
    await platform.reminder.update({ where: { id: reminderId }, data: { nextDueKm: 60_000 } });
    await scan();
    expect(await reminderEmails(reminderId)).toHaveLength(0);
  });

  it('without an email nothing is sent and the reminder stays open for the WhatsApp list', async () => {
    const { reminderId } = await dueCar({ email: null });
    await scan();
    expect(await reminderEmails(reminderId)).toHaveLength(0);
    const due = await reminders.inGarage(g.garageId, () => reminders.dueNow());
    expect(due.find((d) => d.reminder.id === reminderId)?.round).toBe(1);
  });

  it('an opted-out customer gets nothing', async () => {
    const { reminderId, customerId } = await dueCar();
    await platform.garageCustomer.update({
      where: { id: customerId },
      data: { remindersOptOut: true },
    });
    await scan();
    expect(await reminderEmails(reminderId)).toHaveLength(0);
  });

  it('follows up after 30 days, twice at most', async () => {
    const { reminderId } = await dueCar();
    await scan();
    await counted(reminderId, 1);
    const monthAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

    for (const round of [2, 3]) {
      await scan();
      expect(await reminderEmails(reminderId)).toHaveLength(round - 1); // not yet: 30 days
      await platform.reminder.update({
        where: { id: reminderId },
        data: { lastNotifiedAt: monthAgo },
      });
      await scan();
      await counted(reminderId, round);
    }
    await platform.reminder.update({
      where: { id: reminderId },
      data: { lastNotifiedAt: monthAgo },
    });
    await scan();
    expect(await reminderEmails(reminderId)).toHaveLength(3);
  });

  it('servicing the car closes the reminder', async () => {
    const { reminderId, carId } = await dueCar();
    await as(owner)
      .post('/v1/visits/quick', {
        vehicleId: carId,
        odometer: 50_500,
        services: [{ serviceTypeId: oilId, unitPriceCents: 4000 }],
      })
      .expect(201);
    await scan();
    expect(await reminderEmails(reminderId)).toHaveLength(0);
    expect((await platform.reminder.findUniqueOrThrow({ where: { id: reminderId } })).status).toBe(
      'COMPLETED',
    );
  });

  it('a warranty end is emailed with its own template', async () => {
    const { reminderId, carId } = await dueCar();
    const warranty = await platform.reminder.create({
      data: {
        garageId: g.garageId,
        vehicleId: carId,
        ownerId: (await platform.vehicle.findUniqueOrThrow({ where: { id: carId } })).ownerId,
        serviceTypeId: oilId,
        sourceRecordId: (await platform.reminder.findUniqueOrThrow({ where: { id: reminderId } }))
          .sourceRecordId,
        kind: 'WARRANTY_END',
        nextDueDate: new Date(),
      },
    });
    await scan();
    await counted(warranty.id, 1);
    const [email] = await reminderEmails(warranty.id);
    expect(email).toMatchObject({ type: 'WARRANTY_END', template: 'warranty-end', status: 'SENT' });
  });

  it('sends nothing outside the daytime window', async () => {
    const { reminderId } = await dueCar();
    await platform.garage.update({ where: { id: g.garageId }, data: { timezone: zoneAt(2) } });
    try {
      expect(await scan()).toEqual({ emailed: 0, monthly: 0 });
      expect(await reminderEmails(reminderId)).toHaveLength(0);
    } finally {
      await platform.garage.update({ where: { id: g.garageId }, data: { timezone: zoneAt(13) } });
    }
  });

  describe('monthly reminder', () => {
    it('is off by default, then sent once a month to customers with an email', async () => {
      const { customerId, reminderId } = await dueCar();
      const monthly = () =>
        platform.notification.findMany({
          where: { type: 'MONTHLY_REMINDER', refId: customerId },
        });
      // Its service reminder this month comes first; the monthly one waits for next month.
      await scan();
      await counted(reminderId, 1);
      expect(await monthly()).toHaveLength(0);

      const quiet = await dueCar();
      await platform.reminder.update({
        where: { id: quiet.reminderId },
        data: { nextDueKm: 90_000 },
      });
      const quietMonthly = () =>
        platform.notification.findMany({
          where: { type: 'MONTHLY_REMINDER', refId: quiet.customerId },
        });
      await scan();
      expect(await quietMonthly()).toHaveLength(0); // the garage has not turned it on

      await platform.garageSettings.update({
        where: { garageId: g.garageId },
        data: { monthlyReminderEnabled: true },
      });
      try {
        await scan();
        await scan();
        const sent = await waitFor(async () => {
          const rows = await quietMonthly();
          return rows[0]?.status === 'SENT' ? rows : null;
        });
        expect(sent).toHaveLength(1);
        expect(await monthly()).toHaveLength(0);
      } finally {
        await platform.garageSettings.update({
          where: { garageId: g.garageId },
          data: { monthlyReminderEnabled: false },
        });
      }
    });
  });
});
