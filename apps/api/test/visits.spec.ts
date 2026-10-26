// Step 2.4: quick entry, visits, service records, reminders and history (flow.md 4-6).
// Tenant isolation for these endpoints lives in tenancy.spec.ts (README 5.1.6).
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { addMonths, localDate } from '@gearva/contracts';
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

const DAY = 24 * 60 * 60 * 1000;

describe('Quick entry, visits and history', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let g: TestStaffGarage;
  let owner: string;
  const types: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (cookie: string) => ({
    get: (url: string) => http().get(url).set('Cookie', cookie),
    post: (url: string, body?: object) => http().post(url).set('Cookie', cookie).send(body),
    patch: (url: string, body: object) => http().patch(url).set('Cookie', cookie).send(body),
  });
  const today = () => localDate(new Date(), 'Asia/Beirut');

  /** A customer with one car whose last reading was `daysAgo` days ago. */
  async function newCar(unit: 'KM' | 'MI' = 'KM', odometer = 85000, daysAgo = 10) {
    const customer = (
      await as(owner).post('/v1/customers', { name: 'Car Owner', phone: randomPhone() }).expect(201)
    ).body;
    const car = (
      await as(owner)
        .post(`/v1/customers/${customer.id}/vehicles`, {
          plate: `V ${randomUUID().slice(0, 6)}`,
          make: 'Toyota',
          model: 'Corolla',
          distanceUnit: unit,
          odometer,
        })
        .expect(201)
    ).body;
    await platform.vehicle.update({
      where: { id: car.id },
      data: { lastOdometerAt: new Date(Date.now() - daysAgo * DAY) },
    });
    return car as { id: string; currentKm: number };
  }

  const quick = (cookie: string, body: object) => as(cookie).post('/v1/visits/quick', body);

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    g = await createGarageWithOwner(app);
    ({ cookie: owner } = await staffLogin(app, g.ownerEmail, g.password));
    for (const t of await platform.serviceType.findMany({ where: { garageId: null } })) {
      types[t.code] = t.id;
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  it('lists the global service types, with a garage override replacing its default', async () => {
    const before = await as(owner).get('/v1/service-types').expect(200);
    expect(before.body.map((t: { code: string }) => t.code)).toEqual([
      'OIL_CHANGE',
      'WHEELS',
      'STEERING_OIL',
      'TRANSMISSION_OIL',
      'DIFFERENTIAL_OIL',
      'GEAR_OIL',
      'BRAKES',
      'BATTERY',
      'AC',
      'ENGINE',
      'OTHER',
    ]);
    const override = await platform.serviceType.create({
      data: {
        garageId: g.garageId,
        code: 'GEAR_OIL',
        nameEn: 'Gear oil',
        nameAr: 'زيت الجير',
        defaultIntervalKm: 30000,
        defaultIntervalMonths: 12,
        sortOrder: 50,
      },
    });
    const after = await as(owner).get('/v1/service-types').expect(200);
    const gear = after.body.find((t: { code: string }) => t.code === 'GEAR_OIL');
    expect(gear).toMatchObject({ id: override.id, defaultIntervalKm: 30000 });
    expect(after.body).toHaveLength(11);
  });

  describe('quick entry (flow.md 4.2)', () => {
    it('saves visit, record, next due, reminder, suggestions and the car in one go', async () => {
      const car = await newCar();
      const res = await quick(owner, {
        vehicleId: car.id,
        odometer: 85500,
        services: [
          {
            serviceTypeId: types.OIL_CHANGE,
            quantity: '4.5',
            unitPriceCents: 1100,
            details: { brand: 'Castrol', grade: '5W-30', filterChanged: true },
          },
        ],
      }).expect(201);

      // flow.md 6: 85,500 + 5,000 km; today + 6 months. 4.5 x $11.00 = $49.50.
      expect(res.body).toMatchObject({
        status: 'DONE',
        odometerKm: 85500,
        totalCents: 4950,
        branch: { id: g.branchId, code: 'BR1' },
      });
      expect(res.body.finishedAt).not.toBeNull();
      expect(res.body.records[0]).toMatchObject({
        quantity: '4.50',
        totalCents: 4950,
        nextDueKm: 90500,
        nextDueDate: addMonths(today(), 6),
        details: { brand: 'Castrol', grade: '5W-30', filterChanged: true },
      });

      // flow.md 5.1: 500 km in 10 days.
      const vehicle = await platform.vehicle.findUniqueOrThrow({ where: { id: car.id } });
      expect(vehicle.currentKm).toBe(85500);
      expect(Number(vehicle.avgDailyKm)).toBe(50);

      const reminders = await platform.reminder.findMany({ where: { vehicleId: car.id } });
      expect(reminders).toEqual([
        expect.objectContaining({ kind: 'SERVICE_DUE', status: 'ACTIVE', nextDueKm: 90500 }),
      ]);
      const brands = await as(owner).get('/v1/suggestions?field=OIL_BRAND&q=cas').expect(200);
      expect(brands.body.items).toEqual([{ value: 'Castrol', useCount: 1 }]);

      // flow.md 4.4: DONE queues CAR_READY; with no channel yet it is logged SKIPPED.
      await waitFor(() =>
        platform.notification.findFirst({
          where: { refId: res.body.id, type: 'CAR_READY', status: 'SKIPPED' },
        }),
      );
      const audit = await platform.auditLog.findFirst({
        where: { action: 'visit.quick', entityId: res.body.id },
      });
      expect(audit).toMatchObject({ actorType: 'STAFF', garageId: g.garageId });
    });

    it('a new oil change completes the previous reminder; prefill reuses the last values', async () => {
      const car = await newCar();
      const oil = { serviceTypeId: types.OIL_CHANGE, details: { brand: 'Total', grade: '10W-40' } };
      await quick(owner, { vehicleId: car.id, odometer: 85400, services: [oil] }).expect(201);

      const prefill = await as(owner)
        .get(`/v1/vehicles/${car.id}/prefill?serviceTypeId=${types.OIL_CHANGE}`)
        .expect(200);
      expect(prefill.body).toMatchObject({
        estimatedKm: 85400,
        estimatedOdometer: 85400,
        last: { details: { brand: 'Total', grade: '10W-40' }, odometerKm: 85400 },
        nextDueKm: 90400,
      });

      await quick(owner, {
        vehicleId: car.id,
        odometer: 90100,
        services: [oil],
        confirmOdometer: undefined,
      }).expect(201);
      const reminders = await platform.reminder.findMany({
        where: { vehicleId: car.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(reminders.map((r) => [r.status, r.nextDueKm])).toEqual([
        ['COMPLETED', 90400],
        ['ACTIVE', 95100],
      ]);
    });

    it('a car on miles: due 3,600 mi later, stored in km (flow.md 6 example)', async () => {
      const car = await newCar('MI', 3000);
      const res = await quick(owner, {
        vehicleId: car.id,
        odometer: 3417,
        services: [{ serviceTypeId: types.OIL_CHANGE }],
      }).expect(201);
      // 3,417 mi = 5,499 km; + 3,600 mi (5,794 km) = 11,293 km = 7,017 mi.
      expect(res.body.records[0]).toMatchObject({ odometerKm: 5499, nextDueKm: 11293 });
    });

    it('the mechanic may change or remove the next due values', async () => {
      const car = await newCar();
      const res = await quick(owner, {
        vehicleId: car.id,
        odometer: 85300,
        services: [{ serviceTypeId: types.OIL_CHANGE, nextDueOdometer: 95000, nextDueDate: null }],
      }).expect(201);
      expect(res.body.records[0]).toMatchObject({ nextDueKm: 95000, nextDueDate: null });
    });

    it('warranty and "recommended in N months" create their own reminders', async () => {
      const car = await newCar();
      await quick(owner, {
        vehicleId: car.id,
        odometer: 85200,
        services: [
          {
            serviceTypeId: types.BRAKES,
            details: { position: 'FRONT', part: 'PADS', padBrand: 'Brembo' },
            warrantyUntil: '2027-06-30',
            recommendedNote: 'Rear pads at 30%',
            recommendedAfterMonths: 3,
          },
        ],
      }).expect(201);
      const reminders = await platform.reminder.findMany({ where: { vehicleId: car.id } });
      expect(reminders.map((r) => r.kind).sort()).toEqual([
        'RECOMMENDED_NEXT',
        'SERVICE_DUE',
        'WARRANTY_END',
      ]);
      const recommended = reminders.find((r) => r.kind === 'RECOMMENDED_NEXT');
      expect(recommended?.nextDueDate?.toISOString().slice(0, 10)).toBe(addMonths(today(), 3));
    });

    it('"Other" needs a name, which becomes a suggestion; time-less types set no reminder', async () => {
      const car = await newCar();
      const nameless = await quick(owner, {
        vehicleId: car.id,
        odometer: 85100,
        services: [{ serviceTypeId: types.OTHER }],
      }).expect(400);
      expect(nameless.body.details.issues[0].path).toEqual(['services', 0, 'customName']);

      await quick(owner, {
        vehicleId: car.id,
        odometer: 85100,
        services: [{ serviceTypeId: types.OTHER, customName: 'Headlight bulb', unitPriceCents: 0 }],
      }).expect(201);
      expect(await platform.reminder.count({ where: { vehicleId: car.id } })).toBe(0);
      const names = await as(owner).get('/v1/suggestions?field=SERVICE_NAME&q=head').expect(200);
      expect(names.body.items).toEqual([{ value: 'Headlight bulb', useCount: 1 }]);
    });

    it('details must match the service type', async () => {
      const car = await newCar();
      const bad = [
        { serviceTypeId: types.OIL_CHANGE, details: { colour: 'gold' } },
        { serviceTypeId: types.BRAKES, details: { position: 'MIDDLE' } },
        { serviceTypeId: types.ENGINE, details: { anything: 1 } },
        { serviceTypeId: types.OIL_CHANGE, quantity: '1.005' },
      ];
      for (const line of bad) {
        const res = await quick(owner, { vehicleId: car.id, odometer: 85100, services: [line] });
        expect({ line, status: res.status }).toEqual({ line, status: 400 });
      }
      // Nothing was half-saved.
      expect(await platform.visit.count({ where: { vehicleId: car.id } })).toBe(0);
    });
  });

  describe('odometer rules (flow.md 5.3)', () => {
    it('a lower reading needs confirming, then is audit logged as a correction', async () => {
      const car = await newCar();
      const body = { vehicleId: car.id, odometer: 1200, services: [{ serviceTypeId: types.AC }] };
      const refused = await quick(owner, body).expect(409);
      expect(refused.body).toMatchObject({
        code: 'ODOMETER_CONFIRMATION_REQUIRED',
        details: { check: 'CORRECTION', previousKm: 85000, newKm: 1200 },
      });
      expect(await platform.visit.count({ where: { vehicleId: car.id } })).toBe(0);

      await quick(owner, { ...body, confirmOdometer: 'CORRECTION' }).expect(201);
      const audit = await platform.auditLog.findFirst({
        where: { action: 'vehicle.odometer_correction', entityId: car.id },
      });
      expect(audit?.before).toEqual({ km: 85000 });
      const vehicle = await platform.vehicle.findUniqueOrThrow({ where: { id: car.id } });
      expect(vehicle.currentKm).toBe(1200);
    });

    it('more than 5,000 km per day needs confirming as a likely typo', async () => {
      const car = await newCar('KM', 85000, 1);
      const body = { vehicleId: car.id, odometer: 850000, services: [{ serviceTypeId: types.AC }] };
      const refused = await quick(owner, body).expect(409);
      expect(refused.body.details.check).toBe('TYPO');
      await quick(owner, { ...body, confirmOdometer: 'TYPO' }).expect(201);
    });
  });

  describe('longer jobs (flow.md 4.2, 4.4)', () => {
    it('open, add records, wait for parts, finish; finishing twice is refused', async () => {
      const car = await newCar();
      const opened = await as(owner)
        .post('/v1/visits', { vehicleId: car.id, odometer: 85050 })
        .expect(201);
      expect(opened.body).toMatchObject({ status: 'IN_PROGRESS', records: [], finishedAt: null });
      const id = opened.body.id as string;

      const empty = await as(owner).post(`/v1/visits/${id}/finish`).expect(409);
      expect(empty.body.code).toBe('VISIT_HAS_NO_RECORDS');

      await as(owner)
        .post(`/v1/visits/${id}/records`, {
          services: [
            { serviceTypeId: types.BATTERY, unitPriceCents: 9000, details: { brand: 'Varta' } },
            { serviceTypeId: types.WHEELS, quantity: 4, unitPriceCents: 500 },
          ],
        })
        .expect(201);
      const waiting = await as(owner)
        .patch(`/v1/visits/${id}`, { status: 'WAITING_FOR_PARTS', notes: 'Waiting for a tyre' })
        .expect(200);
      expect(waiting.body).toMatchObject({ status: 'WAITING_FOR_PARTS', totalCents: 11000 });

      // Two staff finish at the same moment: one wins, the other is told (flow.md 13).
      const [first, second] = await Promise.all([
        as(owner).post(`/v1/visits/${id}/finish`),
        as(owner).post(`/v1/visits/${id}/finish`),
      ]);
      expect([first.status, second.status].sort()).toEqual([200, 409]);
      const loser = first.status === 409 ? first : second;
      expect(loser.body.code).toBe('VISIT_ALREADY_FINISHED');

      const late = await as(owner)
        .post(`/v1/visits/${id}/records`, { services: [{ serviceTypeId: types.AC }] })
        .expect(409);
      expect(late.body.code).toBe('VISIT_ALREADY_FINISHED');
      await as(owner).patch(`/v1/visits/${id}`, { status: 'IN_PROGRESS' }).expect(409);
    });
  });

  describe('roles and branches (flow.md 1)', () => {
    it('a receptionist can read a visit but not create or change one', async () => {
      const car = await newCar();
      const visit = (
        await quick(owner, {
          vehicleId: car.id,
          odometer: 85100,
          services: [{ serviceTypeId: types.AC }],
          finish: false,
        }).expect(201)
      ).body;
      const { cookie } = await signInAsStaff(app, g, 'RECEPTIONIST');
      await as(cookie).get(`/v1/visits/${visit.id}`).expect(200);
      await as(cookie).get(`/v1/vehicles/${car.id}/history`).expect(200);
      await quick(cookie, {
        vehicleId: car.id,
        odometer: 85200,
        services: [{ serviceTypeId: types.AC }],
      }).expect(403);
      await as(cookie).post(`/v1/visits/${visit.id}/finish`).expect(403);
    });

    it('a mechanic records visits in their own branch only', async () => {
      const second = (await as(owner).post('/v1/branches', { name: 'Second' }).expect(201)).body;
      const car = await newCar();
      const { userId, cookie } = await signInAsStaff(app, g, 'MECHANIC');

      const own = await quick(cookie, {
        vehicleId: car.id,
        odometer: 85100,
        services: [{ serviceTypeId: types.AC }],
      }).expect(201);
      expect(own.body).toMatchObject({ branch: { id: g.branchId }, mechanic: { id: userId } });
      expect(own.body.records[0].mechanic.id).toBe(userId);

      await quick(cookie, {
        vehicleId: car.id,
        odometer: 85200,
        branchId: second.id,
        services: [{ serviceTypeId: types.AC }],
      }).expect(403);

      // The owner works in any branch; the mechanic cannot see that branch's visits.
      const there = await quick(owner, {
        vehicleId: car.id,
        odometer: 85300,
        branchId: second.id,
        services: [{ serviceTypeId: types.AC }],
      }).expect(201);
      expect(there.body.branch.code).toBe(second.code);
      await as(cookie).get(`/v1/visits/${there.body.id}`).expect(404);
    });
  });

  it('history: newest first, paginated, with the branch of each visit', async () => {
    const car = await newCar();
    for (const [odometer, code] of [
      [85100, 'OIL_CHANGE'],
      [85200, 'BRAKES'],
      [85300, 'AC'],
    ] as const) {
      await quick(owner, {
        vehicleId: car.id,
        odometer,
        services: [{ serviceTypeId: types[code] }],
      }).expect(201);
    }
    const page1 = await as(owner).get(`/v1/vehicles/${car.id}/history?pageSize=2`).expect(200);
    expect(page1.body.total).toBe(3);
    expect(
      page1.body.items.map((r: { serviceType: { code: string } }) => r.serviceType.code),
    ).toEqual(['AC', 'BRAKES']);
    expect(page1.body.items[0].visit).toMatchObject({ status: 'DONE', branchCode: 'BR1' });
    const page2 = await as(owner)
      .get(`/v1/vehicles/${car.id}/history?pageSize=2&page=2`)
      .expect(200);
    expect(page2.body.items.map((r: { odometerKm: number }) => r.odometerKm)).toEqual([85100]);
  });
});
