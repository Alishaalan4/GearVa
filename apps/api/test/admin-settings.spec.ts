// Step 5.3: system settings and default service types (flow.md 11.4). Settings are shared
// by every test file running at the same time, so these tests change only values nothing
// else reads (the prices), and check the effect of the others with a stubbed service.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type GarageDetail,
  type GlobalServiceTypeItem,
  SYSTEM_SETTING_DEFAULTS,
  SYSTEM_SETTING_KEYS,
  type SystemSettings,
} from '@gearva/contracts';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { PlatformDb } from '../src/common/db/platform-db';
import { SystemSettingsService } from '../src/system-settings/system-settings.service';
import { signInAsNewAdmin } from './helpers/admin';
import { createTestApp } from './helpers/app';
import { createGarageWithOwner, randomPhone, staffLogin } from './helpers/staff';

const DAY = 24 * 60 * 60 * 1000;

describe('System settings and default service types', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let admin: string;
  let superAdmin: string;

  const as = (cookie: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('Cookie', cookie),
    post: (url: string, body?: object) =>
      request(app.getHttpServer()).post(url).set('Cookie', cookie).send(body),
    patch: (url: string, body: object) =>
      request(app.getHttpServer()).patch(url).set('Cookie', cookie).send(body),
  });

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    ({ cookie: admin } = await signInAsNewAdmin(app));
    ({ cookie: superAdmin } = await signInAsNewAdmin(app, 'SUPER_ADMIN'));
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('settings', () => {
    it('every admin reads them; the defaults until changed', async () => {
      const res = await as(admin).get('/admin/v1/settings').expect(200);
      expect(Object.keys(res.body).sort()).toEqual(Object.keys(SYSTEM_SETTING_DEFAULTS).sort());
      await request(app.getHttpServer()).get('/admin/v1/settings').expect(401);
    });

    it('a super admin changes them; a plain admin cannot', async () => {
      await as(admin).patch('/admin/v1/settings', { yearPriceCents: 1 }).expect(403);
      const res = await as(superAdmin)
        .patch('/admin/v1/settings', { yearPriceCents: 25_000, extraBranchPriceCents: 12_000 })
        .expect(200);
      expect(res.body).toMatchObject({ yearPriceCents: 25_000, extraBranchPriceCents: 12_000 });
      const row = await platform.systemSetting.findUniqueOrThrow({
        where: { key: SYSTEM_SETTING_KEYS.yearPriceCents },
      });
      expect(row.value).toBe(25_000);
      expect(row.updatedById).not.toBeNull();
      expect(
        await platform.auditLog.count({ where: { action: 'system_settings.update' } }),
      ).toBeGreaterThan(0);
      // Back to the defaults for later runs.
      await as(superAdmin)
        .patch('/admin/v1/settings', {
          yearPriceCents: SYSTEM_SETTING_DEFAULTS.yearPriceCents,
          extraBranchPriceCents: SYSTEM_SETTING_DEFAULTS.extraBranchPriceCents,
        })
        .expect(200);
    });

    it('refuses bad values, also a window that ends before the stored start', async () => {
      await as(superAdmin).patch('/admin/v1/settings', { trialDays: 0 }).expect(400);
      await as(superAdmin).patch('/admin/v1/settings', { yearPriceCents: 12.5 }).expect(400);
      // Only the end is sent; with the stored start (9) it would end before it starts.
      await as(superAdmin).patch('/admin/v1/settings', { reminderDaytimeEndHour: 8 }).expect(400);
      expect(
        await platform.systemSetting.count({
          where: { key: SYSTEM_SETTING_KEYS.reminderDaytimeEndHour },
        }),
      ).toBe(0);
    });
  });

  describe('where the settings apply (stubbed, so other test files are not affected)', () => {
    let stubbed: INestApplication;
    const settings: SystemSettings = {
      ...SYSTEM_SETTING_DEFAULTS,
      trialDays: 14,
      defaultDailyKm: 100,
    };

    beforeAll(async () => {
      stubbed = await createTestApp([], (builder) =>
        builder.overrideProvider(SystemSettingsService).useValue({ get: async () => settings }),
      );
    });

    afterAll(async () => {
      await stubbed?.close();
    });

    it('a new trial garage gets the trial days of the settings', async () => {
      const { cookie } = await signInAsNewAdmin(stubbed);
      const id = randomUUID().slice(0, 8);
      const res = await request(stubbed.getHttpServer())
        .post('/admin/v1/garages')
        .set('Cookie', cookie)
        .send({
          name: `[test] Garage ${id}`,
          email: `settings-${id}@test.local`,
          phone: '+961 3 000 000',
          locationText: 'Beirut',
          defaultLocale: 'en',
          ownerName: 'Owner',
          plan: 'TRIAL',
        })
        .expect(201);
      const days = (Date.parse((res.body as GarageDetail).trialEndsAt ?? '') - Date.now()) / DAY;
      expect(days).toBeGreaterThan(13.9);
      expect(days).toBeLessThan(14.1);
    });

    it("a car with no history is estimated with the settings' daily km", async () => {
      const g = await createGarageWithOwner(stubbed);
      const { cookie } = await staffLogin(stubbed, g.ownerEmail, g.password);
      const http = () => request(stubbed.getHttpServer());
      const customer = (
        await http()
          .post('/v1/customers')
          .set('Cookie', cookie)
          .send({ name: 'Settings', phone: randomPhone() })
          .expect(201)
      ).body as { id: string };
      const car = (
        await http()
          .post(`/v1/customers/${customer.id}/vehicles`)
          .set('Cookie', cookie)
          .send({
            plate: `S ${id6()}`,
            make: 'Kia',
            model: 'Rio',
            distanceUnit: 'KM',
            odometer: 10_000,
          })
          .expect(201)
      ).body as { id: string };
      // Its reading was 10 days ago, with no average yet: 10,000 + 10 x 100.
      await platform.vehicle.update({
        where: { id: car.id },
        data: { lastOdometerAt: new Date(Date.now() - 10 * DAY - 60_000) },
      });
      const detail = await http().get(`/v1/vehicles/${car.id}`).set('Cookie', cookie).expect(200);
      expect(detail.body.estimatedKm).toBe(11_000);
    });
  });

  describe('default service types', () => {
    // Created hidden (isActive false), so garages' lists in other test files never change.
    const newType = () => ({
      code: `TEST_${randomUUID().slice(0, 8).toUpperCase()}`,
      nameEn: 'Window tint',
      nameAr: 'تظليل',
      defaultIntervalKm: null,
      defaultIntervalMi: null,
      defaultIntervalMonths: 24,
      isActive: false,
    });

    it('lists the defaults with how many garages override each', async () => {
      const g = await createGarageWithOwner(app);
      await platform.serviceType.create({
        data: {
          garageId: g.garageId,
          code: 'BATTERY',
          nameEn: 'Battery (own)',
          nameAr: 'بطارية',
          defaultIntervalMonths: 18,
        },
      });
      const res = await as(admin).get('/admin/v1/service-types').expect(200);
      const items = res.body as GlobalServiceTypeItem[];
      expect(items.map((t) => t.code)).toContain('OIL_CHANGE');
      expect(items.find((t) => t.code === 'BATTERY')?.overrideCount).toBeGreaterThanOrEqual(1);
    });

    it('a super admin adds one and edits it; a plain admin cannot', async () => {
      const input = newType();
      await as(admin).post('/admin/v1/service-types', input).expect(403);
      const created = (await as(superAdmin).post('/admin/v1/service-types', input).expect(201))
        .body as GlobalServiceTypeItem;
      expect(created).toMatchObject({
        code: input.code,
        detailKey: null,
        isActive: false,
        overrideCount: 0,
      });
      const edited = await as(superAdmin)
        .patch(`/admin/v1/service-types/${created.id}`, {
          nameEn: 'Tint',
          defaultIntervalMonths: 36,
        })
        .expect(200);
      // Fields left out stay as they were.
      expect(edited.body).toMatchObject({
        nameEn: 'Tint',
        defaultIntervalMonths: 36,
        isActive: false,
      });
      await as(admin).patch(`/admin/v1/service-types/${created.id}`, { nameEn: 'No' }).expect(403);
      // The same code twice is refused.
      const again = await as(superAdmin).post('/admin/v1/service-types', input).expect(409);
      expect(again.body.code).toBe('SERVICE_TYPE_CODE_EXISTS');
    });

    it("a garage's own type cannot be edited here", async () => {
      const g = await createGarageWithOwner(app);
      const own = await platform.serviceType.create({
        data: { garageId: g.garageId, code: 'AC', nameEn: 'AC (own)', nameAr: 'مكيف' },
      });
      await as(superAdmin)
        .patch(`/admin/v1/service-types/${own.id}`, { nameEn: 'Changed' })
        .expect(404);
    });
  });
});

function id6(): string {
  return randomUUID().slice(0, 6);
}
