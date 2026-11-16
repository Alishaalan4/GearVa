// Step 2.3: customers, vehicles, search and suggestions (flow.md 3, 4.3, 13).
// Tenant isolation for these endpoints lives in tenancy.spec.ts (README 5.1.6).
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { PlatformDb } from '../src/common/db/platform-db';
import { createTestApp } from './helpers/app';
import { waitFor } from './helpers/garages';
import {
  type TestStaffGarage,
  createGarageWithOwner,
  randomPhone,
  signInAsStaff,
  staffLogin,
} from './helpers/staff';

describe('Customers, vehicles, search, suggestions', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let g: TestStaffGarage;
  let owner: string;

  const http = () => request(app.getHttpServer());
  const as = (cookie: string) => ({
    get: (url: string) => http().get(url).set('Cookie', cookie),
    post: (url: string, body?: object) => http().post(url).set('Cookie', cookie).send(body),
    patch: (url: string, body: object) => http().patch(url).set('Cookie', cookie).send(body),
  });
  const newPlate = () => `T ${randomUUID().slice(0, 6).toUpperCase()}`;

  async function addCustomer(cookie = owner, phone = randomPhone()) {
    const res = await as(cookie).post('/v1/customers', { name: 'Rami Haddad', phone });
    return res.body as { id: string; phone: string };
  }

  function addCar(customerId: string, overrides: Record<string, unknown> = {}) {
    return as(owner).post(`/v1/customers/${customerId}/vehicles`, {
      plate: newPlate(),
      make: 'Toyota',
      model: 'Corolla',
      year: 2018,
      distanceUnit: 'KM',
      odometer: 85000,
      ...overrides,
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    g = await createGarageWithOwner(app);
    ({ cookie: owner } = await staffLogin(app, g.ownerEmail, g.password));
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('customers (flow.md 3.1)', () => {
    it('adds a customer with the phone in E.164, an audit row and an app invite', async () => {
      const local = `0${randomPhone().slice(4)}`; // e.g. 070123456, typed the local way
      const res = await as(owner)
        .post('/v1/customers', { name: '  Rami Haddad ', phone: local, notes: 'VIP' })
        .expect(201);
      expect(res.body).toMatchObject({
        created: true,
        name: 'Rami Haddad',
        phone: `+961${local.slice(1)}`,
        notes: 'VIP',
        vehicles: [],
      });

      const audit = await platform.auditLog.findFirst({
        where: { action: 'customer.create', entityId: res.body.id },
      });
      expect(audit).toMatchObject({ actorType: 'STAFF', garageId: g.garageId });

      // No email is collected, so the app invite waits for WhatsApp (flow.md 3.1 step 5).
      const invite = await waitFor(() =>
        platform.notification.findFirst({
          where: { refId: res.body.id, template: 'customer-app-invite', status: 'SKIPPED' },
        }),
      );
      expect(invite).toMatchObject({ channel: 'WHATSAPP', type: 'INVITE', garageId: g.garageId });
    });

    it('the same phone twice returns the existing customer (flow.md 13)', async () => {
      const phone = randomPhone();
      const first = await as(owner).post('/v1/customers', { name: 'First', phone }).expect(201);
      // Typed differently, and with another name: still the same customer, unchanged.
      const spaced = `${phone.slice(0, 4)} ${phone.slice(4, 6)} ${phone.slice(6)}`;
      const again = await as(owner)
        .post('/v1/customers', { name: 'Other', phone: spaced })
        .expect(200);
      expect(again.body).toMatchObject({ id: first.body.id, created: false, name: 'First' });
      expect(await platform.owner.count({ where: { phone } })).toBe(1);
    });

    it('refuses a phone number that is not a real number', async () => {
      const res = await as(owner)
        .post('/v1/customers', { name: 'X Y', phone: '12345' })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('viewing a customer is audit logged; editing changes only the garage data', async () => {
      const customer = await addCustomer();
      await as(owner).get(`/v1/customers/${customer.id}`).expect(200);
      expect(
        await platform.auditLog.count({
          where: { action: 'customer.view', entityId: customer.id },
        }),
      ).toBe(1);

      const edited = await as(owner)
        .patch(`/v1/customers/${customer.id}`, {
          name: 'Rami H.',
          notes: '',
          remindersOptOut: true,
        })
        .expect(200);
      expect(edited.body).toMatchObject({
        name: 'Rami H.',
        notes: null,
        remindersOptOut: true,
        phone: customer.phone,
      });
    });

    it('every role adds customers and cars (flow.md 1); an unknown id is a 404', async () => {
      const { cookie } = await signInAsStaff(app, g, 'RECEPTIONIST');
      const customer = await addCustomer(cookie);
      await as(cookie)
        .post(`/v1/customers/${customer.id}/vehicles`, {
          plate: newPlate(),
          make: 'Kia',
          model: 'Rio',
          distanceUnit: 'KM',
          odometer: 0,
        })
        .expect(201);
      await as(owner).get(`/v1/customers/${randomUUID()}`).expect(404);
    });
  });

  describe('customer list (README 5.4: paginated, no export)', () => {
    it('newest first, with the number of cars, for every role', async () => {
      const older = await addCustomer();
      const newer = await addCustomer();
      await addCar(newer.id).expect(201);
      const { cookie } = await signInAsStaff(app, g, 'MECHANIC');
      const res = await as(cookie).get('/v1/customers?pageSize=2').expect(200);
      expect(res.body.items.map((c: { id: string }) => c.id)).toEqual([newer.id, older.id]);
      expect(res.body.items[0]).toMatchObject({ vehicleCount: 1, phone: newer.phone });
      expect(res.body.total).toBeGreaterThanOrEqual(2);
    });

    it('filters by name or by the end of the phone; pages stay at most 50', async () => {
      const name = `Ziad ${randomUUID().slice(0, 6)}`;
      const phone = randomPhone();
      const customer = (await as(owner).post('/v1/customers', { name, phone }).expect(201))
        .body as { id: string };
      const byName = await as(owner)
        .get(`/v1/customers?q=${encodeURIComponent(name.toLowerCase())}`)
        .expect(200);
      expect(byName.body.items.map((c: { id: string }) => c.id)).toEqual([customer.id]);
      const local = `0${phone.slice(4)}`;
      const byPhone = await as(owner).get(`/v1/customers?q=${local}`).expect(200);
      expect(byPhone.body.items.map((c: { id: string }) => c.id)).toEqual([customer.id]);
      await as(owner).get('/v1/customers?pageSize=51').expect(400);
    });
  });

  describe('vehicles (flow.md 3.2)', () => {
    it('stores the odometer in km for a car on miles, and estimates today', async () => {
      const customer = await addCustomer();
      const res = await addCar(customer.id, { distanceUnit: 'MI', odometer: 100 }).expect(201);
      expect(res.body).toMatchObject({
        distanceUnit: 'MI',
        currentKm: 161,
        estimatedKm: 161,
        avgDailyKm: null,
        customer: { id: customer.id, phone: customer.phone },
      });
      await as(owner).get(`/v1/vehicles/${res.body.id}`).expect(200);
      expect(
        await platform.auditLog.count({ where: { action: 'vehicle.view', entityId: res.body.id } }),
      ).toBe(1);
    });

    it('an existing plate answers with that car instead of failing silently', async () => {
      const first = await addCustomer();
      const car = (await addCar(first.id, { plate: 'z 123-987' }).expect(201)).body;
      const second = await addCustomer();
      // Same plate typed another way, for another customer.
      const res = await addCar(second.id, { plate: 'Z123987' }).expect(409);
      expect(res.body).toMatchObject({
        code: 'VEHICLE_PLATE_EXISTS',
        details: { vehicle: { id: car.id, plate: 'z 123-987' }, customer: { id: first.id } },
      });

      const other = (await addCar(second.id).expect(201)).body;
      const rename = await as(owner)
        .patch(`/v1/vehicles/${other.id}`, { plate: 'Z-123-987' })
        .expect(409);
      expect(rename.body.code).toBe('VEHICLE_PLATE_EXISTS');
    });

    it('a customer can have any number of cars (flow.md 3.2.1)', async () => {
      const customer = await addCustomer();
      await addCar(customer.id).expect(201);
      await addCar(customer.id).expect(201);
      const detail = await as(owner).get(`/v1/customers/${customer.id}`).expect(200);
      expect(detail.body.vehicles).toHaveLength(2);
    });

    it('editing a car never changes its odometer', async () => {
      const customer = await addCustomer();
      const car = (await addCar(customer.id).expect(201)).body;
      const res = await as(owner)
        .patch(`/v1/vehicles/${car.id}`, { make: 'Lexus', odometer: 1 })
        .expect(200);
      expect(res.body).toMatchObject({ make: 'Lexus', currentKm: 85000 });
    });
  });

  describe('search (flow.md 3.3)', () => {
    it('finds a car by plate prefix, typed any way', async () => {
      const customer = await addCustomer();
      const plate = `Q${randomUUID().slice(0, 6).toUpperCase()}`;
      const car = (await addCar(customer.id, { plate }).expect(201)).body;
      const typed = `${plate.slice(0, 2).toLowerCase()} ${plate.slice(2, 5)}`;
      const res = await as(owner)
        .get(`/v1/search?q=${encodeURIComponent(typed)}`)
        .expect(200);
      expect(res.body.items).toEqual([
        {
          customer: expect.objectContaining({ id: customer.id }),
          vehicle: expect.objectContaining({ id: car.id }),
        },
      ]);
    });

    it("finds all of a customer's cars by phone, and a customer without a car", async () => {
      const withCars = await addCustomer();
      await addCar(withCars.id).expect(201);
      await addCar(withCars.id).expect(201);
      const local = `0${withCars.phone.slice(4)}`;
      const byPhone = await as(owner)
        .get(`/v1/search?q=${encodeURIComponent(local)}`)
        .expect(200);
      expect(byPhone.body.total).toBe(2);

      const noCar = await addCustomer();
      const res = await as(owner)
        .get(`/v1/search?q=${noCar.phone.slice(-6)}`)
        .expect(200);
      expect(res.body.items).toEqual([
        { customer: expect.objectContaining({ id: noCar.id }), vehicle: null },
      ]);
    });

    it('needs at least 2 characters and pages its results', async () => {
      await as(owner).get('/v1/search?q=a').expect(400);
      await as(owner).get('/v1/search?q=ab&pageSize=51').expect(400);
      const res = await as(owner).get('/v1/search?q=zz-no-such&pageSize=5').expect(200);
      expect(res.body).toEqual({ items: [], page: 1, pageSize: 5, total: 0 });
    });
  });

  describe('suggestions (flow.md 4.3)', () => {
    it('one entry per value whatever the case, most used first, first spelling kept', async () => {
      const make = `Brand${randomUUID().slice(0, 5)}`;
      const customer = await addCustomer();
      await addCar(customer.id, { make }).expect(201);
      await addCar(customer.id, { make: ` ${make.toUpperCase()} ` }).expect(201);
      await addCar(customer.id, { make: `${make}x` }).expect(201);

      const res = await as(owner)
        .get(`/v1/suggestions?field=VEHICLE_MAKE&q=${make.slice(0, 7).toLowerCase()}`)
        .expect(200);
      expect(res.body.items).toEqual([
        { value: make, useCount: 2 },
        { value: `${make}x`, useCount: 1 },
      ]);
    });

    it('needs a known field', async () => {
      await as(owner).get('/v1/suggestions?field=NOPE').expect(400);
    });
  });

  describe('owner app invite and set password (step 6.1, flow.md 2.4)', () => {
    const uniqueEmail = () => `sara-${randomUUID().slice(0, 8)}@test.local`;

    /** The token from the newest owner-invite email of this customer. */
    async function inviteToken(customerId: string): Promise<{ token: string; link: URL }> {
      const n = await platform.notification.findFirstOrThrow({
        where: { refId: customerId, template: 'owner-invite' },
        orderBy: { createdAt: 'desc' },
      });
      const link = new URL((n.payload as { link: string }).link);
      return { token: link.searchParams.get('token') as string, link };
    }

    const setPassword = (token: string, password = 'owner app password 1') =>
      http().post('/mobile/v1/auth/set-password').send({ token, password });

    it('needs the customer email, and is not for mechanics', async () => {
      const c = await addCustomer();
      const noEmail = await as(owner).post(`/v1/customers/${c.id}/app-invite`).expect(400);
      expect(noEmail.body.code).toBe('CUSTOMER_EMAIL_REQUIRED');

      await as(owner).patch(`/v1/customers/${c.id}`, { email: uniqueEmail() }).expect(200);
      const mechanic = await signInAsStaff(app, g, 'MECHANIC');
      await as(mechanic.cookie).post(`/v1/customers/${c.id}/app-invite`).expect(403);
      const receptionist = await signInAsStaff(app, g, 'RECEPTIONIST');
      await as(receptionist.cookie).post(`/v1/customers/${c.id}/app-invite`).expect(200);
    });

    it('invites, sets the password once, then refuses a second invite', async () => {
      const c = await addCustomer();
      const email = uniqueEmail();
      await as(owner).patch(`/v1/customers/${c.id}`, { email: email.toUpperCase() }).expect(200);
      const before = await as(owner).get(`/v1/customers/${c.id}`).expect(200);
      expect(before.body).toMatchObject({ appStatus: 'NONE', inviteSentAt: null });

      const invited = await as(owner).post(`/v1/customers/${c.id}/app-invite`).expect(200);
      expect(invited.body.appStatus).toBe('INVITED');
      expect(invited.body.inviteSentAt).toEqual(expect.any(String));

      // The owner row got the login email and a hashed 7-day link; the email is queued.
      const ownerRow = await platform.owner.findUniqueOrThrow({ where: { phone: c.phone } });
      expect(ownerRow).toMatchObject({ email, passwordHash: null });
      expect(ownerRow.inviteTokenHash).toMatch(/^[0-9a-f]{64}$/);
      const days = (ownerRow.inviteExpiresAt!.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.9);
      const n = await platform.notification.findFirstOrThrow({
        where: { refId: c.id, template: 'owner-invite' },
      });
      expect(n).toMatchObject({
        channel: 'EMAIL',
        type: 'INVITE',
        recipient: email,
        garageId: g.garageId,
        ownerId: ownerRow.id,
      });
      const audit = await platform.auditLog.findFirst({
        where: { action: 'customer.app_invite', entityId: c.id },
      });
      expect(audit).toMatchObject({ actorType: 'STAFF', garageId: g.garageId });

      // "Send again" replaces the link: the first one stops working.
      const first = await inviteToken(c.id);
      await as(owner).post(`/v1/customers/${c.id}/app-invite`).expect(200);
      const second = await inviteToken(c.id);
      expect(second.token).not.toBe(first.token);
      expect(second.link.pathname).toBe('/en/owner/set-password');
      expect((await setPassword(first.token).expect(400)).body.code).toBe('INVALID_LINK');

      // The page: too short is refused, then the password is saved and the link is spent.
      await setPassword(second.token, 'short').expect(400);
      const saved = await setPassword(second.token).expect(200);
      expect(saved.body).toEqual({ email });
      expect((await setPassword(second.token).expect(400)).body.code).toBe('INVALID_LINK');
      const active = await platform.owner.findUniqueOrThrow({ where: { id: ownerRow.id } });
      expect(active.passwordHash).toMatch(/^\$argon2id\$/);
      expect(active).toMatchObject({ inviteTokenHash: null, inviteExpiresAt: null });
      expect(active.passwordSetAt).toBeInstanceOf(Date);
      expect(
        await platform.auditLog.findFirst({
          where: { action: 'owner.set_password', actorType: 'OWNER', actorId: ownerRow.id },
        }),
      ).toMatchObject({ garageId: null });

      const after = await as(owner).get(`/v1/customers/${c.id}`).expect(200);
      expect(after.body.appStatus).toBe('ACTIVE');
      const again = await as(owner).post(`/v1/customers/${c.id}/app-invite`).expect(409);
      expect(again.body.code).toBe('OWNER_APP_ALREADY_ACTIVE');
    });

    it('a second garage sees the account as active and cannot re-invite (one login)', async () => {
      const phone = randomPhone();
      const c = await addCustomer(owner, phone);
      await as(owner).patch(`/v1/customers/${c.id}`, { email: uniqueEmail() }).expect(200);
      await as(owner).post(`/v1/customers/${c.id}/app-invite`).expect(200);
      await setPassword((await inviteToken(c.id)).token).expect(200);

      const other = await createGarageWithOwner(app);
      const { cookie } = await staffLogin(app, other.ownerEmail, other.password);
      const theirs = await addCustomer(cookie, phone);
      await as(cookie).patch(`/v1/customers/${theirs.id}`, { email: uniqueEmail() }).expect(200);
      const detail = await as(cookie).get(`/v1/customers/${theirs.id}`).expect(200);
      expect(detail.body.appStatus).toBe('ACTIVE');
      const res = await as(cookie).post(`/v1/customers/${theirs.id}/app-invite`).expect(409);
      expect(res.body.code).toBe('OWNER_APP_ALREADY_ACTIVE');
    });

    it('refuses an email that another person uses for the app', async () => {
      const email = uniqueEmail();
      const first = await addCustomer();
      await as(owner).patch(`/v1/customers/${first.id}`, { email }).expect(200);
      await as(owner).post(`/v1/customers/${first.id}/app-invite`).expect(200);

      const second = await addCustomer();
      await as(owner).patch(`/v1/customers/${second.id}`, { email }).expect(200);
      const res = await as(owner).post(`/v1/customers/${second.id}/app-invite`).expect(409);
      expect(res.body.code).toBe('EMAIL_ALREADY_USED');
      const row = await platform.owner.findUniqueOrThrow({ where: { phone: second.phone } });
      expect(row).toMatchObject({ email: null, inviteTokenHash: null });
    });

    it('an expired link is refused', async () => {
      const c = await addCustomer();
      await as(owner).patch(`/v1/customers/${c.id}`, { email: uniqueEmail() }).expect(200);
      await as(owner).post(`/v1/customers/${c.id}/app-invite`).expect(200);
      const { token } = await inviteToken(c.id);
      await platform.owner.update({
        where: { phone: c.phone },
        data: { inviteExpiresAt: new Date(Date.now() - 1000) },
      });
      expect((await setPassword(token).expect(400)).body.code).toBe('INVALID_LINK');
    });
  });
});
