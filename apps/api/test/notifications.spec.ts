// Step 1.3: the notification pipeline end to end with the real queue and worker:
// record (deduplicated) -> dispatch (BullMQ) -> deliver (console email) -> stored outcome.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@gearva/database';
import { PlatformDb } from '../src/common/db/platform-db';
import {
  NotificationsService,
  type NewNotification,
} from '../src/notifications/notifications.service';
import { createTestApp } from './helpers/app';
import { createTestGarages, waitFor } from './helpers/garages';

describe('Notifications', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let notifications: NotificationsService;
  let garageA: string;
  let garageB: string;

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    notifications = app.get(NotificationsService);
    ({ garageA, garageB } = await createTestGarages(platform));
  });

  afterAll(async () => {
    await app?.close();
  });

  function invite(overrides: Partial<NewNotification> = {}): NewNotification {
    return {
      garageId: garageA,
      channel: 'EMAIL',
      type: 'INVITE',
      template: 'staff-invite',
      locale: 'en',
      recipient: 'owner@test.local',
      payload: {
        name: 'Owner',
        garageName: 'Test Garage',
        link: 'http://localhost:3000/set-password?token=x',
      },
      dedupeKey: `INVITE:${randomUUID()}`,
      ...overrides,
    };
  }

  /** Records + dispatches like a caller would, then waits for the worker's outcome. */
  async function sendAndWait(input: NewNotification) {
    const { notification } = await notifications.record(platform, input);
    await notifications.dispatch(notification);
    return waitFor(() =>
      platform.notification.findFirst({
        where: { id: notification.id, status: { not: 'QUEUED' } },
      }),
    );
  }

  it('delivers an email through the console adapter and stores SENT', async () => {
    const result = await sendAndWait(invite());
    expect(result).toMatchObject({ status: 'SENT', error: null });
    expect(result.sentAt).toBeInstanceOf(Date);
  });

  it('renders the Arabic template too', async () => {
    const result = await sendAndWait(invite({ locale: 'ar' }));
    expect(result.status).toBe('SENT');
  });

  it('the same dedupeKey never creates a second row', async () => {
    const input = invite();
    const first = await notifications.record(platform, input);
    const second = await notifications.record(platform, input);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.notification.id).toBe(first.notification.id);
    expect(
      await platform.notification.count({
        where: { garageId: garageA, dedupeKey: input.dedupeKey },
      }),
    ).toBe(1);
  });

  it('the same dedupeKey is allowed in another garage', async () => {
    const dedupeKey = `INVITE:${randomUUID()}`;
    const a = await notifications.record(platform, invite({ dedupeKey }));
    const b = await notifications.record(platform, invite({ dedupeKey, garageId: garageB }));
    expect(a.created && b.created).toBe(true);
  });

  it('a channel that does not exist yet is stored as SKIPPED', async () => {
    const result = await sendAndWait(invite({ channel: 'WHATSAPP', recipient: '+9613000000' }));
    expect(result).toMatchObject({ status: 'SKIPPED', error: 'No WHATSAPP channel yet' });
  });

  it('no recipient is stored as SKIPPED', async () => {
    const result = await sendAndWait(invite({ recipient: null }));
    expect(result).toMatchObject({ status: 'SKIPPED', error: 'No recipient' });
  });

  it('invalid template data is stored as FAILED with the reason', async () => {
    const result = await sendAndWait(invite({ payload: { name: 'Owner' } }));
    expect(result.status).toBe('FAILED');
    expect(result.error).toBeTruthy();
  });
});
