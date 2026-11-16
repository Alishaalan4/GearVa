// Step 6.4: the owner app's inbox, push through Firebase (faked here) and push devices
// (docs/mobile-api.md 6; flow.md 9). Isolation between owners is in tenancy-owner.spec.ts.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { PlatformDb } from '../src/common/db/platform-db';
import {
  PUSH_SENDER,
  type PushMessage,
  type PushOutcome,
  type PushSender,
} from '../src/notifications/push/push-sender';
import { RemindersService } from '../src/reminders/reminders.service';
import { createTestApp } from './helpers/app';
import { waitFor } from './helpers/garages';
import { type TestOwner, addCustomer, createOwnerAccount, ownerLogin } from './helpers/owners';
import {
  type TestStaffGarage,
  createGarageWithOwner,
  randomPhone,
  staffLogin,
} from './helpers/staff';

/** A fixed-offset zone whose clock now shows about `hour` o'clock (as reminders.spec). */
function zoneAt(hour: number): string {
  let offset = (((hour - new Date().getUTCHours()) % 24) + 24) % 24;
  if (offset > 12) offset -= 24;
  return offset === 0 ? 'Etc/GMT' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
}

/** Records pushes instead of calling Firebase; tokens starting with "dead" are gone. */
class FakePush implements PushSender {
  readonly enabled = true;
  readonly sent: { token: string; message: PushMessage }[] = [];
  send(token: string, message: PushMessage): Promise<PushOutcome> {
    if (token.startsWith('dead')) return Promise.resolve('DEAD');
    this.sent.push({ token, message });
    return Promise.resolve('SENT');
  }
}

describe('Owner app: inbox, push, devices (step 6.4)', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let reminders: RemindersService;
  let g: TestStaffGarage;
  let staff: string;
  let oilId: string;
  const push = new FakePush();

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const scan = () => reminders.inGarage(g.garageId, () => reminders.scanGarage());
  const token = () => `fcm-${randomUUID()}`;

  /** A car whose oil change is due now (as reminders.spec), for this customer. */
  async function dueCar(customerId: string) {
    const car = await http()
      .post(`/v1/customers/${customerId}/vehicles`)
      .set('Cookie', staff)
      .send({
        plate: `R ${randomUUID().slice(0, 6)}`,
        make: 'Kia',
        model: 'Rio',
        distanceUnit: 'KM',
        odometer: 50_000,
      })
      .expect(201);
    await http()
      .post('/v1/visits/quick')
      .set('Cookie', staff)
      .send({
        vehicleId: car.body.id,
        odometer: 50_100,
        services: [{ serviceTypeId: oilId, unitPriceCents: 4000 }],
      })
      .expect(201);
    const reminder = await platform.reminder.findFirstOrThrow({
      where: { vehicleId: car.body.id, kind: 'SERVICE_DUE' },
    });
    await platform.reminder.update({ where: { id: reminder.id }, data: { nextDueKm: 50_400 } });
    return { carId: car.body.id as string, reminderId: reminder.id };
  }

  beforeAll(async () => {
    // Its own queue: the fake push must not be used by other test files' workers.
    process.env.QUEUE_PREFIX = `test-inbox-${randomUUID()}`;
    app = await createTestApp([], (builder) =>
      builder.overrideProvider(PUSH_SENDER).useValue(push),
    );
    platform = app.get(PlatformDb).client;
    reminders = app.get(RemindersService);
    g = await createGarageWithOwner(app);
    ({ cookie: staff } = await staffLogin(app, g.ownerEmail, g.password));
    await platform.garage.update({ where: { id: g.garageId }, data: { timezone: zoneAt(13) } });
    oilId = (
      await platform.serviceType.findFirstOrThrow({ where: { garageId: null, code: 'OIL_CHANGE' } })
    ).id;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('a due reminder reaches the inbox and the phones', () => {
    let owner: TestOwner;
    let access: string;
    let carId: string;
    let reminderId: string;
    let phone: string;
    let notificationId: string;

    beforeAll(async () => {
      owner = await createOwnerAccount(app, staff);
      access = (await ownerLogin(app, owner.email)).accessToken;
      ({ carId, reminderId } = await dueCar(owner.customerId));
      phone = token();
      for (const t of [phone, `dead-${randomUUID()}`]) {
        await http()
          .post('/mobile/v1/devices')
          .set(bearer(access))
          .send({ token: t, platform: 'android' })
          .expect(204);
      }
    });

    it('the scan writes one in-app row, and the push goes to each live phone', async () => {
      const result = await scan();
      expect(result.inApp).toBe(1);
      const row = await waitFor(() =>
        platform.notification.findFirst({
          where: { ownerId: owner.ownerId, channel: 'IN_APP', status: 'SENT' },
        }),
      );
      notificationId = row.id;
      expect(row).toMatchObject({
        type: 'SERVICE_REMINDER',
        recipient: owner.ownerId,
        refType: 'vehicle',
        refId: carId,
        garageId: g.garageId,
      });
      const pushed = push.sent.filter((p) => p.token === phone);
      expect(pushed).toHaveLength(1);
      expect(pushed[0]?.message).toEqual({
        title: 'Oil change due soon',
        body: expect.stringContaining('Kia Rio'),
        data: {
          notificationId: row.id,
          type: 'SERVICE_REMINDER',
          refType: 'vehicle',
          refId: carId,
        },
      });
      // The dead token was removed.
      expect(await platform.deviceToken.count({ where: { ownerId: owner.ownerId } })).toBe(1);
    });

    it('the email still counts the round once; a second scan writes nothing new', async () => {
      await waitFor(() =>
        platform.reminder.findFirst({ where: { id: reminderId, status: 'SENT', notifyCount: 1 } }),
      );
      expect((await scan()).inApp).toBe(0);
      expect(
        await platform.notification.count({ where: { ownerId: owner.ownerId, channel: 'IN_APP' } }),
      ).toBe(1);
      const row = await platform.reminder.findUniqueOrThrow({ where: { id: reminderId } });
      expect(row.notifyCount).toBe(1);
    });

    it('the inbox shows it in the owner’s language, and it can be marked read', async () => {
      const inbox = await http().get('/mobile/v1/notifications').set(bearer(access)).expect(200);
      expect(inbox.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
      expect(inbox.body.items[0]).toEqual({
        id: notificationId,
        type: 'SERVICE_REMINDER',
        title: 'Oil change due soon',
        body: expect.stringContaining('Kindly check your km'),
        garage: { id: g.garageId, name: expect.any(String) },
        ref: { type: 'vehicle', id: carId },
        createdAt: expect.any(String),
        readAt: null,
      });
      const unread = async () =>
        (await http().get('/mobile/v1/me').set(bearer(access)).expect(200)).body
          .unreadNotifications;
      expect(await unread()).toBe(1);

      await http()
        .post(`/mobile/v1/notifications/${notificationId}/read`)
        .set(bearer(access))
        .expect(204);
      expect(await unread()).toBe(0);
      await http()
        .post(`/mobile/v1/notifications/${notificationId}/read`)
        .set(bearer(access))
        .expect(204);
      await http().post('/mobile/v1/notifications/read-all').set(bearer(access)).expect(204);
      await http()
        .post(`/mobile/v1/notifications/${randomUUID()}/read`)
        .set(bearer(access))
        .expect(404);
    });
  });

  it('a customer without the app gets no in-app row', async () => {
    const customerId = await addCustomer(
      app,
      staff,
      randomPhone(),
      `no-app-${randomUUID().slice(0, 8)}@test.local`,
    );
    const { reminderId } = await dueCar(customerId);
    await scan();
    await waitFor(() =>
      platform.reminder.findFirst({ where: { id: reminderId, status: 'SENT', notifyCount: 1 } }),
    );
    const customer = await platform.garageCustomer.findUniqueOrThrow({ where: { id: customerId } });
    expect(
      await platform.notification.count({
        where: { ownerId: customer.ownerId, channel: 'IN_APP' },
      }),
    ).toBe(0);
  });

  describe('devices (6.4)', () => {
    it('registers, moves a phone to its new owner, removes, and deletion clears them', async () => {
      const first = await createOwnerAccount(app, staff);
      const second = await createOwnerAccount(app, staff);
      const a = (await ownerLogin(app, first.email)).accessToken;
      const b = (await ownerLogin(app, second.email)).accessToken;
      const t = token();

      await http()
        .post('/mobile/v1/devices')
        .set(bearer(a))
        .send({ token: t, platform: 'ios' })
        .expect(204);
      await http()
        .post('/mobile/v1/devices')
        .set(bearer(a))
        .send({ token: t, platform: 'ios' })
        .expect(204);
      expect(await platform.deviceToken.count({ where: { token: t } })).toBe(1);
      await http()
        .post('/mobile/v1/devices')
        .set(bearer(a))
        .send({ token: t, platform: 'windows' })
        .expect(400);

      // The phone changes hands: the token now belongs to the second owner.
      await http()
        .post('/mobile/v1/devices')
        .set(bearer(b))
        .send({ token: t, platform: 'ios' })
        .expect(204);
      expect((await platform.deviceToken.findUniqueOrThrow({ where: { token: t } })).ownerId).toBe(
        second.ownerId,
      );
      // The first owner cannot remove it any more; the second can.
      await http()
        .delete(`/mobile/v1/devices/${encodeURIComponent(t)}`)
        .set(bearer(a))
        .expect(204);
      expect(await platform.deviceToken.count({ where: { token: t } })).toBe(1);
      await http()
        .delete(`/mobile/v1/devices/${encodeURIComponent(t)}`)
        .set(bearer(b))
        .expect(204);
      expect(await platform.deviceToken.count({ where: { token: t } })).toBe(0);

      await http()
        .post('/mobile/v1/devices')
        .set(bearer(b))
        .send({ token: token(), platform: 'android' })
        .expect(204);
      await http()
        .delete('/mobile/v1/me')
        .set(bearer(b))
        .send({ password: 'owner app password 1' })
        .expect(204);
      expect(await platform.deviceToken.count({ where: { ownerId: second.ownerId } })).toBe(0);
    });
  });
});
