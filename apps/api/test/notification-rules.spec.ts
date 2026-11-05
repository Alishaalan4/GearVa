// Step 4.2: the pipeline rules of flow.md 9.3 and 9.4 with the real queue and worker and
// a fake email channel: retries, final failures, daytime only, the monthly cap, and rows
// left QUEUED without a job.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { REMINDER_MAX_PER_GARAGE_PER_MONTH, nextDaytimeStart } from '@gearva/contracts';
import type { PrismaClient } from '@gearva/database';
import { ClsService } from 'nestjs-cls';
import { RequestContext } from '../src/common/context/request-context';
import { PlatformDb } from '../src/common/db/platform-db';
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
  type SendInput,
  type SendResult,
} from '../src/notifications/notification-channel';
import {
  NotificationsService,
  type NewNotification,
} from '../src/notifications/notifications.service';
import { createTestApp } from './helpers/app';
import { createTestGarages, waitFor } from './helpers/garages';

/** Answers by recipient: `down@` always fails for now, `once@` fails once, `bad@` for good. */
class FakeEmail implements NotificationChannel {
  readonly channel = 'EMAIL' as const;
  readonly calls = new Map<string, number>();

  send(input: SendInput): Promise<SendResult> {
    const count = (this.calls.get(input.recipient) ?? 0) + 1;
    this.calls.set(input.recipient, count);
    const [box] = input.recipient.split('@');
    if (box === 'down')
      return Promise.resolve({ ok: false, error: 'Provider down', retryable: true });
    if (box === 'once' && count === 1) return Promise.reject(new Error('Connection reset'));
    if (box === 'bad') return Promise.resolve({ ok: false, error: 'Address rejected' });
    return Promise.resolve({ ok: true });
  }
}

/** A fixed-offset zone whose clock now shows about `hour` o'clock. */
function zoneAt(hour: number): string {
  let offset = (((hour - new Date().getUTCHours()) % 24) + 24) % 24;
  if (offset > 12) offset -= 24;
  // Etc zones have the sign reversed: Etc/GMT-3 is UTC+3.
  return offset === 0 ? 'Etc/GMT' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
}

describe('Notification rules', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let notifications: NotificationsService;
  const email = new FakeEmail();
  let day: string;
  let night: string;
  let capped: string;

  beforeAll(async () => {
    // Its own queues: the test files run in parallel, and another file's worker (with the
    // console channel) must not take these jobs, nor this worker theirs.
    process.env.QUEUE_PREFIX = `test-rules-${randomUUID()}`;
    app = await createTestApp([], (builder) =>
      builder.overrideProvider(NOTIFICATION_CHANNELS).useValue([email]),
    );
    platform = app.get(PlatformDb).client;
    notifications = app.get(NotificationsService);
    ({ garageA: day, garageB: night } = await createTestGarages(platform));
    ({ garageA: capped } = await createTestGarages(platform));
    // Midday and the middle of the night, whatever time the tests run.
    for (const [id, hour] of [
      [day, 13],
      [capped, 13],
      [night, 2],
    ] as const) {
      await platform.garage.update({ where: { id }, data: { timezone: zoneAt(hour) } });
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  function message(overrides: Partial<NewNotification> = {}): NewNotification {
    return {
      garageId: day,
      channel: 'EMAIL',
      type: 'INVITE',
      template: 'staff-invite',
      locale: 'en',
      recipient: `ok@${randomUUID()}.test`,
      payload: {},
      dedupeKey: `TEST:${randomUUID()}`,
      ...overrides,
    };
  }

  async function send(input: NewNotification) {
    const { notification } = await notifications.record(platform, input);
    await notifications.dispatch(notification);
    return notification.id;
  }

  function settled(id: string) {
    return waitFor(() =>
      platform.notification.findFirst({ where: { id, status: { not: 'QUEUED' } } }),
    );
  }

  it('a passing failure is retried and then SENT', async () => {
    const recipient = `once@${randomUUID()}.test`;
    const result = await settled(await send(message({ recipient })));
    expect(result).toMatchObject({ status: 'SENT' });
    expect(email.calls.get(recipient)).toBe(2);
  });

  it('a failure that lasts is FAILED after 3 attempts, with the error', async () => {
    const recipient = `down@${randomUUID()}.test`;
    const result = await settled(await send(message({ recipient })));
    expect(result).toMatchObject({ status: 'FAILED', error: 'Provider down' });
    expect(email.calls.get(recipient)).toBe(3);
  });

  it('a final failure is not retried', async () => {
    const recipient = `bad@${randomUUID()}.test`;
    const result = await settled(await send(message({ recipient })));
    expect(result).toMatchObject({ status: 'FAILED', error: 'Address rejected' });
    expect(email.calls.get(recipient)).toBe(1);
  });

  it('a reminder at night waits for 09:00 in the garage, and is not sent', async () => {
    const recipient = `ok@${randomUUID()}.test`;
    const id = await send(message({ garageId: night, type: 'SERVICE_REMINDER', recipient }));
    const row = await waitFor(() =>
      platform.notification.findFirst({ where: { id, scheduledFor: { not: null } } }),
    );
    const garage = await platform.garage.findUniqueOrThrow({ where: { id: night } });
    expect(row.status).toBe('QUEUED');
    expect(row.scheduledFor).toEqual(nextDaytimeStart(new Date(), garage.timezone));
    expect(email.calls.get(recipient)).toBeUndefined();
  });

  it('other messages are sent at night too', async () => {
    const result = await settled(await send(message({ garageId: night })));
    expect(result.status).toBe('SENT');
  });

  it('over the monthly cap, a reminder email is SKIPPED with the reason', async () => {
    await platform.notification.createMany({
      data: Array.from({ length: REMINDER_MAX_PER_GARAGE_PER_MONTH }, (_, i) => ({
        ...message({ garageId: capped, type: 'SERVICE_REMINDER' }),
        dedupeKey: `CAP:${i}`,
        status: 'SENT' as const,
        sentAt: new Date(),
      })),
    });
    const reminder = await settled(
      await send(message({ garageId: capped, type: 'SERVICE_REMINDER' })),
    );
    expect(reminder).toMatchObject({ status: 'SKIPPED', error: 'Monthly reminder limit reached' });
    // The cap is for reminders only.
    const invite = await settled(await send(message({ garageId: capped })));
    expect(invite.status).toBe('SENT');
  });

  it('a row left QUEUED without a job is queued again, once', async () => {
    const old = new Date(Date.now() - 15 * 60_000);
    const recipient = `ok@${randomUUID()}.test`;
    const { notification } = await notifications.record(platform, message({ recipient }));
    await platform.notification.update({
      where: { id: notification.id },
      data: { createdAt: old },
    });

    const requeue = () =>
      app.get(ClsService).run(async () => {
        app.get(RequestContext).setActor({
          type: 'SYSTEM',
          id: null,
          garageId: day,
          role: null,
          branchId: null,
        });
        return notifications.requeueStuck();
      });
    // Twice at once: the job id is the notification id, so it is sent once.
    await Promise.all([requeue(), requeue()]);
    expect((await settled(notification.id)).status).toBe('SENT');
    expect(email.calls.get(recipient)).toBe(1);
  });
});
