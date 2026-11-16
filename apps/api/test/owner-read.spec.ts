// Step 6.3: the owner app's cars, history, invoices, PDFs and garage logos
// (docs/mobile-api.md 3.6, 4, 5). Isolation between owners is in tenancy-owner.spec.ts.
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { PlatformDb } from '../src/common/db/platform-db';
import { createTestApp } from './helpers/app';
import { waitFor } from './helpers/garages';
import { type TestOwner, createOwnerAccount, ownerLogin } from './helpers/owners';
import { type TestStaffGarage, createGarageWithOwner, staffLogin } from './helpers/staff';

/** The start of a PNG: enough for the logo type check. */
const PNG = Buffer.from('89504e470d0a1a0a0000', 'hex');

describe('Owner app: cars, history, invoices (step 6.3)', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let g: TestStaffGarage;
  let staff: string;
  let owner: TestOwner;
  let token: string;
  let oilChangeId: string;
  let carId: string;
  let invoiceId: string;
  let openVisitId: string;

  const http = () => request(app.getHttpServer());
  const asOwner = (url: string, lang?: string) => {
    const req = http().get(url).set('Authorization', `Bearer ${token}`);
    return lang ? req.set('Accept-Language', lang) : req;
  };
  const asStaff = (url: string, body: object) => http().post(url).set('Cookie', staff).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    oilChangeId = (
      await platform.serviceType.findFirstOrThrow({ where: { garageId: null, code: 'OIL_CHANGE' } })
    ).id;
    g = await createGarageWithOwner(app);
    ({ cookie: staff } = await staffLogin(app, g.ownerEmail, g.password));
    owner = await createOwnerAccount(app, staff);
    token = (await ownerLogin(app, owner.email)).accessToken;

    const car = await asStaff(`/v1/customers/${owner.customerId}/vehicles`, {
      plate: 'B 123456',
      make: 'Toyota',
      model: 'Corolla',
      year: 2018,
      distanceUnit: 'KM',
      odometer: 84000,
    }).expect(201);
    carId = car.body.id;
    const done = await asStaff('/v1/visits/quick', {
      vehicleId: carId,
      odometer: 84200,
      services: [
        {
          serviceTypeId: oilChangeId,
          unitPriceCents: 4500,
          details: { brand: 'Castrol', grade: '5W-30', liters: 4, filterChanged: true },
          recommendedNote: 'Brake pads at 30%',
        },
      ],
      payment: { method: 'CASH', amountCents: 2000 },
    }).expect(201);
    invoiceId = done.body.invoice.id;
    // A visit still in progress has no invoice yet.
    openVisitId = (await asStaff('/v1/visits', { vehicleId: carId, odometer: 84300 }).expect(201))
      .body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('cars (4.1, 4.2)', () => {
    it('lists the car with its garage, estimate and next service', async () => {
      const res = await asOwner('/mobile/v1/vehicles', 'en').expect(200);
      expect(res.body).toEqual([
        {
          id: carId,
          garage: { id: g.garageId, name: expect.any(String) },
          plate: 'B 123456',
          make: 'Toyota',
          model: 'Corolla',
          year: 2018,
          distanceUnit: 'KM',
          lastRecordedKm: 84300,
          lastRecordedAt: expect.any(String),
          estimatedKm: expect.any(Number),
          nextService: {
            serviceName: 'Oil change',
            dueKm: 89200,
            dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            status: 'OK',
          },
        },
      ]);
    });

    it('names follow Accept-Language, else the owner’s language', async () => {
      const ar = await asOwner('/mobile/v1/vehicles', 'ar-LB,ar;q=0.9').expect(200);
      expect(ar.body[0].nextService.serviceName).toBe('تغيير زيت المحرك');
      const saved = await asOwner('/mobile/v1/vehicles').expect(200); // owner locale: en
      expect(saved.body[0].nextService.serviceName).toBe('Oil change');
    });

    it('SOON inside the garage’s lead, OVERDUE once passed (the reminder rule)', async () => {
      const reminder = await platform.reminder.findFirstOrThrow({
        where: { vehicleId: carId, kind: 'SERVICE_DUE' },
      });
      const status = async () =>
        (await asOwner(`/mobile/v1/vehicles/${carId}`).expect(200)).body.nextService.status;
      await platform.reminder.update({ where: { id: reminder.id }, data: { nextDueKm: 84600 } });
      expect(await status()).toBe('SOON');
      await platform.reminder.update({ where: { id: reminder.id }, data: { nextDueKm: 84000 } });
      expect(await status()).toBe('OVERDUE');
      await platform.reminder.update({
        where: { id: reminder.id },
        data: { nextDueKm: reminder.nextDueKm },
      });
    });

    it('the detail lists every open reminder; an unknown car is 404', async () => {
      const res = await asOwner(`/mobile/v1/vehicles/${carId}`, 'en').expect(200);
      expect(res.body.upcoming.length).toBeGreaterThanOrEqual(1);
      expect(res.body.upcoming[0]).toEqual(res.body.nextService);
      await asOwner('/mobile/v1/vehicles/0193a0d0-0000-7000-8000-000000000000').expect(404);
    });
  });

  describe('history (4.3)', () => {
    it('newest first, with label/value details and the invoice', async () => {
      const res = await asOwner(`/mobile/v1/vehicles/${carId}/visits`, 'en').expect(200);
      expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 2 });
      const [open, done] = res.body.items;
      expect(open).toMatchObject({
        id: openVisitId,
        odometerKm: 84300,
        services: [],
        invoice: null,
      });
      expect(done).toMatchObject({
        odometerKm: 84200,
        garage: { id: g.garageId },
        branchName: 'Main',
        invoice: { id: invoiceId, totalCents: 4500, status: 'PARTIALLY_PAID' },
      });
      expect(done.services).toEqual([
        {
          serviceName: 'Oil change',
          details: [
            { label: 'Brand', value: 'Castrol' },
            { label: 'Grade', value: '5W-30' },
            { label: 'Litres', value: '4' },
            { label: 'Filter changed', value: 'Yes' },
          ],
          notes: null,
          warrantyUntil: null,
          recommendation: 'Brake pads at 30%',
          nextDueKm: 89200,
          nextDueDate: expect.any(String),
        },
      ]);
      const ar = await asOwner(`/mobile/v1/vehicles/${carId}/visits`, 'ar').expect(200);
      expect(ar.body.items[1].services[0].details[3]).toEqual({
        label: 'تم تغيير الفلتر',
        value: 'نعم',
      });
    });
  });

  describe('invoices (5.1 to 5.3)', () => {
    it('lists, filters by status and shows the detail', async () => {
      const all = await asOwner('/mobile/v1/invoices').expect(200);
      expect(all.body.items).toEqual([
        {
          id: invoiceId,
          number: expect.stringMatching(/^BR1-\d{4}-\d{4}$/),
          issuedAt: expect.any(String),
          garage: { id: g.garageId, name: expect.any(String) },
          vehicle: { id: carId, plate: 'B 123456', make: 'Toyota', model: 'Corolla' },
          status: 'PARTIALLY_PAID',
          totalCents: 4500,
          paidCents: 2000,
          remainingCents: 2500,
        },
      ]);
      const paid = await asOwner('/mobile/v1/invoices?status=PAID').expect(200);
      expect(paid.body.total).toBe(0);
      await asOwner('/mobile/v1/invoices?status=NOPE').expect(400);

      const detail = await asOwner(`/mobile/v1/invoices/${invoiceId}`).expect(200);
      expect(detail.body).toMatchObject({
        subtotalCents: 4500,
        discountCents: 0,
        vatCents: 0,
        payments: [{ amountCents: 2000, method: 'CASH', paidAt: expect.any(String) }],
        nextServiceKm: 89200,
        cancelReason: null,
      });
      expect(detail.body.items[0]).toMatchObject({ quantity: '1', unitPriceCents: 4500 });
    });

    it('the PDF, once made', async () => {
      await waitFor(() =>
        platform.invoice.findFirst({ where: { id: invoiceId, pdfFileId: { not: null } } }),
      );
      const res = await asOwner(`/mobile/v1/invoices/${invoiceId}/pdf`).expect(200);
      expect(res.headers['content-type']).toMatch(/application\/pdf/);
      expect(res.headers['cache-control']).toBe('private, no-store');
    });
  });

  describe('garage logo (3.6)', () => {
    it('404 without a logo, the image once the garage uploads one', async () => {
      await asOwner(`/mobile/v1/garages/${g.garageId}/logo`).expect(404);
      await http()
        .post('/v1/invoice-settings/logo')
        .set('Cookie', staff)
        .attach('file', PNG, 'logo.png')
        .expect(200);
      const res = await asOwner(`/mobile/v1/garages/${g.garageId}/logo`).expect(200);
      expect(res.headers['content-type']).toMatch(/image\/png/);
      const me = await asOwner('/mobile/v1/me').expect(200);
      expect(me.body.garages[0].hasLogo).toBe(true);
    });
  });

  describe('locked and removed (flow.md 2.4 step 7)', () => {
    it('a locked garage still shows; a removed customer’s garage does not', async () => {
      await platform.garage.update({ where: { id: g.garageId }, data: { status: 'SUSPENDED' } });
      expect((await asOwner('/mobile/v1/vehicles').expect(200)).body).toHaveLength(1);
      expect((await asOwner('/mobile/v1/invoices').expect(200)).body.total).toBe(1);
      await platform.garage.update({ where: { id: g.garageId }, data: { status: 'ACTIVE' } });

      await platform.garageCustomer.update({
        where: { id: owner.customerId },
        data: { deletedAt: new Date() },
      });
      expect((await asOwner('/mobile/v1/vehicles').expect(200)).body).toEqual([]);
      expect((await asOwner('/mobile/v1/invoices').expect(200)).body.total).toBe(0);
      await asOwner(`/mobile/v1/invoices/${invoiceId}`).expect(404);
      await asOwner(`/mobile/v1/vehicles/${carId}/visits`).expect(404);
      await platform.garageCustomer.update({
        where: { id: owner.customerId },
        data: { deletedAt: null },
      });
    });
  });
});
