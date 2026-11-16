// Step 6.5: offers, garage side (flow.md 10) and in the owner app (mobile-api.md 7).
// Isolation: tenancy.spec.ts (garage against garage) and tenancy-owner.spec.ts.
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { PlatformDb } from '../src/common/db/platform-db';
import { createTestApp } from './helpers/app';
import { type TestOwner, createOwnerAccount, ownerLogin } from './helpers/owners';
import {
  type TestStaffGarage,
  createGarageWithOwner,
  signInAsStaff,
  staffLogin,
} from './helpers/staff';

const PNG = Buffer.from('89504e470d0a1a0a0000', 'hex');
const DAY = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

describe('Offers (step 6.5)', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let g: TestStaffGarage;
  let staff: string;

  const http = () => request(app.getHttpServer());
  const asStaff = (cookie: string) => ({
    get: (url: string) => http().get(url).set('Cookie', cookie),
    post: (url: string, body?: object) => http().post(url).set('Cookie', cookie).send(body),
    patch: (url: string, body: object) => http().patch(url).set('Cookie', cookie).send(body),
  });
  const offer = (extra: object = {}) =>
    asStaff(staff)
      .post('/v1/offers', {
        title: '15% off brake service',
        body: 'Until the end of December.',
        discountType: 'PERCENT',
        discountValue: 15,
        ...extra,
      })
      .expect(201);

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    g = await createGarageWithOwner(app);
    ({ cookie: staff } = await staffLogin(app, g.ownerEmail, g.password));
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('garage side', () => {
    it('creates an active offer for everyone, with an audit row', async () => {
      const res = await offer({ expiresAt: iso(30 * DAY) });
      expect(res.body).toMatchObject({
        title: '15% off brake service',
        hasImage: false,
        discountType: 'PERCENT',
        discountValue: 15,
        isActive: true,
        state: 'ACTIVE',
        viewCount: 0,
      });
      const row = await platform.offer.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row).toMatchObject({ garageId: g.garageId, target: 'ALL', createdById: g.ownerId });
      expect(
        await platform.auditLog.findFirst({
          where: { action: 'offer.create', entityId: res.body.id },
        }),
      ).not.toBeNull();
    });

    it('refuses a percent over 100 and an end before the start', async () => {
      const base = { title: 'Bad', discountType: 'PERCENT' };
      await asStaff(staff)
        .post('/v1/offers', { ...base, discountValue: 101 })
        .expect(400);
      await asStaff(staff)
        .post('/v1/offers', { ...base, discountValue: 10, startsAt: iso(DAY), expiresAt: iso(0) })
        .expect(400);
      const ok = await offer({ discountType: 'AMOUNT', discountValue: 5000 });
      // Switching to PERCENT with the stored 5000 is checked against the result.
      await asStaff(staff)
        .patch(`/v1/offers/${ok.body.id}`, { discountType: 'PERCENT' })
        .expect(400);
    });

    it('is for owners and managers only', async () => {
      const manager = await signInAsStaff(app, g, 'MANAGER');
      await asStaff(manager.cookie).get('/v1/offers').expect(200);
      for (const role of ['MECHANIC', 'RECEPTIONIST'] as const) {
        const { cookie } = await signInAsStaff(app, g, role);
        await asStaff(cookie).get('/v1/offers').expect(403);
        await asStaff(cookie)
          .post('/v1/offers', { title: 'No', discountType: 'AMOUNT', discountValue: 100 })
          .expect(403);
      }
    });

    it('edits, switches off, and shows the state', async () => {
      const created = await offer();
      const id = created.body.id as string;
      const off = await asStaff(staff).patch(`/v1/offers/${id}`, { isActive: false }).expect(200);
      expect(off.body.state).toBe('OFF');
      const later = await asStaff(staff)
        .patch(`/v1/offers/${id}`, { isActive: true, startsAt: iso(DAY), title: 'Soon' })
        .expect(200);
      expect(later.body).toMatchObject({ state: 'SCHEDULED', title: 'Soon' });
      const ended = await asStaff(staff)
        .patch(`/v1/offers/${id}`, { startsAt: iso(-2 * DAY), expiresAt: iso(-DAY) })
        .expect(200);
      expect(ended.body.state).toBe('ENDED');

      const list = await asStaff(staff).get('/v1/offers').expect(200);
      expect(list.body.items[0].id).toBe(id);
      await asStaff(staff).get('/v1/offers/0193a0d0-0000-7000-8000-000000000000').expect(404);
    });

    it('takes a PNG or JPEG image and serves it back', async () => {
      const created = await offer();
      const id = created.body.id as string;
      await http()
        .post(`/v1/offers/${id}/image`)
        .set('Cookie', staff)
        .attach('file', Buffer.from('not an image'), 'x.png')
        .expect(400);
      const saved = await http()
        .post(`/v1/offers/${id}/image`)
        .set('Cookie', staff)
        .attach('file', PNG, 'offer.png')
        .expect(200);
      expect(saved.body.hasImage).toBe(true);
      const img = await asStaff(staff).get(`/v1/offers/${id}/image`).expect(200);
      expect(img.headers['content-type']).toMatch(/image\/png/);
    });
  });

  describe('owner app (mobile-api.md 7)', () => {
    let owner: TestOwner;
    let token: string;
    let activeId: string;

    const asOwner = (url: string) => http().get(url).set('Authorization', `Bearer ${token}`);
    const viewed = (id: string) =>
      http().post(`/mobile/v1/offers/${id}/viewed`).set('Authorization', `Bearer ${token}`);
    const listed = async () =>
      ((await asOwner('/mobile/v1/offers').expect(200)).body as { id: string }[]).map((o) => o.id);

    beforeAll(async () => {
      // A garage of its own, so the earlier offers do not show.
      const garage = await createGarageWithOwner(app);
      ({ cookie: staff } = await staffLogin(app, garage.ownerEmail, garage.password));
      g = garage;
      owner = await createOwnerAccount(app, staff);
      token = (await ownerLogin(app, owner.email)).accessToken;
      activeId = (await offer({ expiresAt: iso(DAY) })).body.id;
      await http()
        .post(`/v1/offers/${activeId}/image`)
        .set('Cookie', staff)
        .attach('file', PNG, 'offer.png')
        .expect(200);
      // Off, not started yet, and ended: none of them show.
      await offer({ isActive: false });
      await offer({ startsAt: iso(DAY) });
      const ended = await offer();
      await platform.offer.update({
        where: { id: ended.body.id },
        data: { startsAt: new Date(Date.now() - 2 * DAY), expiresAt: new Date(Date.now() - DAY) },
      });
    });

    it('lists only the active offers, with their garage', async () => {
      const res = await asOwner('/mobile/v1/offers').expect(200);
      expect(res.body).toEqual([
        {
          id: activeId,
          garage: { id: g.garageId, name: expect.any(String) },
          title: '15% off brake service',
          body: 'Until the end of December.',
          hasImage: true,
          discountType: 'PERCENT',
          discountValue: 15,
          expiresAt: expect.any(String),
        },
      ]);
      const img = await asOwner(`/mobile/v1/offers/${activeId}/image`).expect(200);
      expect(img.headers['content-type']).toMatch(/image\/png/);
    });

    it('a view counts once for the garage', async () => {
      await viewed(activeId).expect(204);
      await viewed(activeId).expect(204);
      expect(await platform.offerView.count({ where: { offerId: activeId } })).toBe(1);
      const garageView = await asStaff(staff).get(`/v1/offers/${activeId}`).expect(200);
      expect(garageView.body.viewCount).toBe(1);
    });

    it('hidden when the owner turned offers off, or the garage is locked', async () => {
      await http()
        .patch(`/mobile/v1/garages/${g.garageId}/preferences`)
        .set('Authorization', `Bearer ${token}`)
        .send({ marketingOptOut: true })
        .expect(200);
      expect(await listed()).toEqual([]);
      await asOwner(`/mobile/v1/offers/${activeId}/image`).expect(404);
      await viewed(activeId).expect(404);
      await http()
        .patch(`/mobile/v1/garages/${g.garageId}/preferences`)
        .set('Authorization', `Bearer ${token}`)
        .send({ marketingOptOut: false })
        .expect(200);
      expect(await listed()).toEqual([activeId]);

      await platform.garage.update({ where: { id: g.garageId }, data: { status: 'SUSPENDED' } });
      expect(await listed()).toEqual([]);
      await viewed(activeId).expect(404);
      await platform.garage.update({ where: { id: g.garageId }, data: { status: 'ACTIVE' } });
    });
  });
});
