// Step 1.5a: admin garage management (flow.md 2.1, 11.1) through the real HTTP stack.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { hashAccessToken } from '../src/auth/access-links';
import { PlatformDb } from '../src/common/db/platform-db';
import { signInAsNewAdmin } from './helpers/admin';
import { createTestApp } from './helpers/app';
import { waitFor } from './helpers/garages';

const DAY = 24 * 60 * 60 * 1000;

describe('Admin garages', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let cookie: string;
  let adminId: string;

  const http = () => request(app.getHttpServer());
  const asAdmin = {
    get: (url: string) => http().get(url).set('Cookie', cookie),
    post: (url: string, body?: object) => http().post(url).set('Cookie', cookie).send(body),
  };

  function newGarage(overrides: Record<string, unknown> = {}) {
    const id = randomUUID().slice(0, 8);
    return {
      name: `[test] Garage ${id}`,
      email: `garage-${id}@test.local`,
      phone: '+961 3 000 000',
      locationText: 'Beirut',
      defaultLocale: 'en',
      ownerName: 'Test Owner',
      plan: 'TRIAL',
      ...overrides,
    };
  }

  /** The link sent in the newest invite or reset email for this user. */
  async function latestLink(userId: string, template: string): Promise<string> {
    const n = await waitFor(() =>
      platform.notification.findFirst({
        where: { userId, template, status: 'SENT' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    return (n.payload as { link: string }).link;
  }

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    ({ adminId, cookie } = await signInAsNewAdmin(app));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('every garage endpoint needs a signed-in admin', async () => {
    await http().get('/admin/v1/garages').expect(401);
    await http().post('/admin/v1/garages').send(newGarage()).expect(401);
  });

  it('creates a trial garage with settings, main branch, owner and invite', async () => {
    const input = newGarage({ defaultLocale: 'ar' });
    const res = await asAdmin.post('/admin/v1/garages', input).expect(201);
    const garage = res.body;

    expect(garage).toMatchObject({
      name: input.name,
      email: input.email,
      status: 'TRIAL',
      isPaid: false,
      expiresAt: null,
      branchCount: 1,
      defaultLocale: 'ar',
      timezone: 'Asia/Beirut',
    });
    const trialDays = (Date.parse(garage.trialEndsAt) - Date.now()) / DAY;
    expect(trialDays).toBeGreaterThan(29.9);
    expect(trialDays).toBeLessThanOrEqual(30);
    expect(garage.branches).toEqual([expect.objectContaining({ code: 'BR1', isMain: true })]);
    expect(garage.owner).toMatchObject({ email: input.email, hasPassword: false });

    // Rows behind the response.
    expect(await platform.garageSettings.count({ where: { garageId: garage.id } })).toBe(1);
    const owner = await platform.user.findFirstOrThrow({ where: { garageId: garage.id } });
    expect(owner).toMatchObject({ role: 'OWNER', passwordHash: null, locale: 'ar' });

    // The invite email goes out, and its link matches the stored hash (not the token).
    const link = new URL(await latestLink(owner.id, 'staff-invite'));
    expect(link.pathname).toBe('/set-password');
    const token = link.searchParams.get('token') as string;
    expect(owner.inviteTokenHash).toBe(hashAccessToken(token));
    expect(owner.inviteTokenHash).not.toContain(token);

    const audit = await platform.auditLog.findFirstOrThrow({
      where: { action: 'garage.create', actorId: adminId },
    });
    expect(audit).toMatchObject({ actorType: 'ADMIN', garageId: garage.id, entityId: garage.id });
  });

  it('creates a paid garage that is ACTIVE until the end of the paid day', async () => {
    const paidUntil = new Date(Date.now() + 365 * DAY).toISOString().slice(0, 10);
    const res = await asAdmin
      .post('/admin/v1/garages', newGarage({ plan: 'PAID', paidUntil }))
      .expect(201);
    expect(res.body).toMatchObject({
      status: 'ACTIVE',
      isPaid: true,
      trialEndsAt: null,
      expiresAt: `${paidUntil}T23:59:59.999Z`,
    });
  });

  it('rejects a paid-until date in the past and a missing one', async () => {
    const past = await asAdmin
      .post('/admin/v1/garages', newGarage({ plan: 'PAID', paidUntil: '2020-01-01' }))
      .expect(400);
    expect(past.body.code).toBe('VALIDATION_FAILED');
    await asAdmin.post('/admin/v1/garages', newGarage({ plan: 'PAID' })).expect(400);
  });

  it('an email that is already a login is refused, and nothing is half-created', async () => {
    const input = newGarage();
    await asAdmin.post('/admin/v1/garages', input).expect(201);
    const again = await asAdmin
      .post('/admin/v1/garages', newGarage({ email: input.email }))
      .expect(409);
    expect(again.body.code).toBe('EMAIL_ALREADY_USED');
    expect(await platform.garage.count({ where: { email: input.email } })).toBe(1);
  });

  it('lists garages with search, status filter and pagination', async () => {
    const created = (await asAdmin.post('/admin/v1/garages', newGarage()).expect(201)).body;

    const byName = await asAdmin
      .get(`/admin/v1/garages?q=${encodeURIComponent(created.name)}`)
      .expect(200);
    expect(byName.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect(byName.body.items[0]).toMatchObject({ id: created.id, branchCount: 1 });

    const trials = await asAdmin.get('/admin/v1/garages?status=TRIAL&pageSize=50').expect(200);
    expect(trials.body.items.every((g: { status: string }) => g.status === 'TRIAL')).toBe(true);

    await asAdmin.get('/admin/v1/garages?pageSize=51').expect(400);
  });

  it('an unknown garage is a 404', async () => {
    const res = await asAdmin.get(`/admin/v1/garages/${randomUUID()}`).expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('resending the invite replaces the link; reset only works once a password exists', async () => {
    const garage = (await asAdmin.post('/admin/v1/garages', newGarage()).expect(201)).body;
    const ownerId = garage.owner.id as string;
    const first = await latestLink(ownerId, 'staff-invite');

    await asAdmin.post(`/admin/v1/garages/${garage.id}/invite`).expect(200);
    const second = await waitFor(async () => {
      const link = await latestLink(ownerId, 'staff-invite');
      return link !== first ? link : null;
    });
    const owner = await platform.user.findUniqueOrThrow({ where: { id: ownerId } });
    const token = new URL(second).searchParams.get('token') as string;
    expect(owner.inviteTokenHash).toBe(hashAccessToken(token));

    const early = await asAdmin.post(`/admin/v1/garages/${garage.id}/password-reset`).expect(409);
    expect(early.body.code).toBe('OWNER_NOT_ACTIVATED');

    // Once the owner has a password (step 1.6 sets it), invite is refused and reset works.
    await platform.user.update({ where: { id: ownerId }, data: { passwordHash: 'set' } });
    const invite = await asAdmin.post(`/admin/v1/garages/${garage.id}/invite`).expect(409);
    expect(invite.body.code).toBe('OWNER_ALREADY_ACTIVE');
    await asAdmin.post(`/admin/v1/garages/${garage.id}/password-reset`).expect(200);
    expect(new URL(await latestLink(ownerId, 'password-reset')).pathname).toBe('/set-password');
  });

  it('suspends with a reason and reactivates back to the right status', async () => {
    const garage = (await asAdmin.post('/admin/v1/garages', newGarage()).expect(201)).body;

    await asAdmin.post(`/admin/v1/garages/${garage.id}/suspend`, {}).expect(400);
    const suspended = await asAdmin
      .post(`/admin/v1/garages/${garage.id}/suspend`, { reason: 'Unpaid invoice' })
      .expect(200);
    expect(suspended.body).toMatchObject({
      status: 'SUSPENDED',
      suspendedReason: 'Unpaid invoice',
    });
    expect(suspended.body.suspendedAt).toBeTruthy();

    const twice = await asAdmin
      .post(`/admin/v1/garages/${garage.id}/suspend`, { reason: 'Again' })
      .expect(409);
    expect(twice.body.code).toBe('GARAGE_ALREADY_SUSPENDED');

    const back = await asAdmin.post(`/admin/v1/garages/${garage.id}/reactivate`).expect(200);
    expect(back.body).toMatchObject({ status: 'TRIAL', suspendedAt: null, suspendedReason: null });

    const audit = await platform.auditLog.findMany({
      where: { garageId: garage.id, action: { in: ['garage.suspend', 'garage.reactivate'] } },
    });
    expect(audit).toHaveLength(2);
  });
});
