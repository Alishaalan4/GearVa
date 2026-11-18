// Step 5.10, super admins only: the audit log (flow.md 11.10), messages to garages with
// their banner and email (flow.md 11.9), "sign out everywhere" (flow.md 11.8), and
// branch changes for super admins only (flow.md 11.7).
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@gearva/database';
import request from 'supertest';
import { PlatformDb } from '../src/common/db/platform-db';
import { renderEmail } from '../src/notifications/templates';
import { signInAsNewAdmin } from './helpers/admin';
import { createTestApp } from './helpers/app';
import { createOwnerAccount, ownerLogin } from './helpers/owners';
import { type TestStaffGarage, createGarageWithOwner, staffLogin } from './helpers/staff';

/** Today in Beirut, as the admin pages count days. */
function beirutToday(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Beirut' }).format(d);
}

describe('Super admin tools (step 5.10)', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let superAdmin: { adminId: string; cookie: string };
  let regular: { adminId: string; cookie: string };
  let g: TestStaffGarage;
  let other: TestStaffGarage;
  let staff: string;
  let otherStaff: string;

  const http = () => request(app.getHttpServer());
  const as = (cookie: string) => ({
    get: (url: string) => http().get(url).set('Cookie', cookie),
    post: (url: string, body?: object) => http().post(url).set('Cookie', cookie).send(body),
    patch: (url: string, body: object) => http().patch(url).set('Cookie', cookie).send(body),
  });
  const su = () => as(superAdmin.cookie);

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    superAdmin = await signInAsNewAdmin(app, 'SUPER_ADMIN');
    regular = await signInAsNewAdmin(app, 'ADMIN');
    g = await createGarageWithOwner(app);
    other = await createGarageWithOwner(app);
    ({ cookie: staff } = await staffLogin(app, g.ownerEmail, g.password));
    ({ cookie: otherStaff } = await staffLogin(app, other.ownerEmail, other.password));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('a regular admin is refused the audit log and messages', async () => {
    for (const url of ['/admin/v1/audit', '/admin/v1/audit/access', '/admin/v1/announcements']) {
      const res = await as(regular.cookie).get(url).expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
    }
    await as(regular.cookie)
      .post('/admin/v1/announcements', {
        title: 'Hello',
        body: 'Hello garages',
        audience: { kind: 'SELECTED', garageIds: [g.garageId] },
        sendEmail: false,
      })
      .expect(403);
    expect(await platform.announcement.count({ where: { sentById: regular.adminId } })).toBe(0);
  });

  describe('audit log', () => {
    it('shows who did what, to whom, with filters', async () => {
      await su()
        .post(`/admin/v1/users/staff/${g.ownerId}/password`, { password: 'a brand new pass' })
        .expect(204);
      ({ cookie: staff } = await staffLogin(app, g.ownerEmail, 'a brand new pass'));

      const res = await su()
        .get(`/admin/v1/audit?actorId=${superAdmin.adminId}&q=staff.password`)
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0]).toMatchObject({
        actorType: 'ADMIN',
        actor: { id: superAdmin.adminId, name: '[test] admin' },
        action: 'admin.users.staff.password',
        entityType: 'user',
        // The person acted on, from the route (the response has no id).
        entityId: g.ownerId,
      });

      // Garage staff actions are there too, with their garage.
      const garageRows = await su()
        .get(`/admin/v1/audit?garageId=${g.garageId}&actorType=STAFF`)
        .expect(200);
      expect(garageRows.body.total).toBeGreaterThan(0);
      for (const row of garageRows.body.items) {
        expect(row).toMatchObject({ actorType: 'STAFF', garage: { id: g.garageId } });
      }

      // Days are Beirut days; tomorrow has nothing yet.
      const today = await su()
        .get(
          `/admin/v1/audit?actorId=${superAdmin.adminId}&from=${beirutToday()}&to=${beirutToday()}`,
        )
        .expect(200);
      expect(today.body.total).toBeGreaterThan(0);
      const tomorrow = await su()
        .get(`/admin/v1/audit?actorId=${superAdmin.adminId}&from=${beirutToday(1)}`)
        .expect(200);
      expect(tomorrow.body.total).toBe(0);
    });

    it('lists the "View as" access log', async () => {
      await platform.adminAccessLog.create({
        data: {
          adminId: superAdmin.adminId,
          garageId: g.garageId,
          action: 'RECORD_VIEWED',
          path: '/v1/customers',
        },
      });
      const res = await su().get(`/admin/v1/audit/access?garageId=${g.garageId}`).expect(200);
      expect(res.body.items[0]).toMatchObject({
        admin: { id: superAdmin.adminId },
        garage: { id: g.garageId },
        action: 'RECORD_VIEWED',
        path: '/v1/customers',
      });
    });
  });

  describe('sign out everywhere', () => {
    it("ends a staff member's sessions without changing the password", async () => {
      const { cookie } = await staffLogin(app, other.ownerEmail, other.password);
      await http().get('/v1/auth/me').set('Cookie', cookie).expect(200);
      const res = await su().post(`/admin/v1/users/staff/${other.ownerId}/sign-out`).expect(200);
      expect(res.body.sessions).toBeGreaterThanOrEqual(2);
      await http().get('/v1/auth/me').set('Cookie', cookie).expect(401);
      // The same password still works.
      ({ cookie: otherStaff } = await staffLogin(app, other.ownerEmail, other.password));
    });

    it("ends a car owner's app sessions", async () => {
      const owner = await createOwnerAccount(app, staff);
      const { accessToken } = await ownerLogin(app, owner.email);
      const bearer = { Authorization: `Bearer ${accessToken}` };
      await http().get('/mobile/v1/me').set(bearer).expect(200);
      const res = await su().post(`/admin/v1/users/owners/${owner.ownerId}/sign-out`).expect(200);
      expect(res.body.sessions).toBe(1);
      await http().get('/mobile/v1/me').set(bearer).expect(401);
    });

    it("ends another admin's sessions, but not your own", async () => {
      const target = await signInAsNewAdmin(app, 'ADMIN');
      await as(target.cookie).get('/admin/v1/auth/me').expect(200);
      await su().post(`/admin/v1/users/admins/${target.adminId}/sign-out`).expect(200);
      await as(target.cookie).get('/admin/v1/auth/me').expect(401);

      const self = await su().post(`/admin/v1/users/admins/${superAdmin.adminId}/sign-out`);
      expect(self.status).toBe(409);
      expect(self.body.code).toBe('CANNOT_MODIFY_SELF');
      await as(regular.cookie).post(`/admin/v1/users/staff/${g.ownerId}/sign-out`).expect(403);
    });
  });

  it('only a super admin adds or switches branches; any admin sees them', async () => {
    const url = `/admin/v1/garages/${g.garageId}/branches`;
    await as(regular.cookie).get(url).expect(200);
    const refused = await as(regular.cookie).post(url, { name: 'Sneaky branch' }).expect(403);
    expect(refused.body.code).toBe('FORBIDDEN');
    const created = await su().post(url, { name: 'North branch' }).expect(201);
    await as(regular.cookie).patch(`${url}/${created.body.id}`, { isActive: false }).expect(403);
    await su().patch(`${url}/${created.body.id}`, { isActive: false }).expect(200);
  });

  describe('messages to garages', () => {
    it('sends a banner and an email to the chosen garage only', async () => {
      const sent = await su()
        .post('/admin/v1/announcements', {
          title: 'Maintenance on Saturday',
          body: 'Gearva is down on Saturday from 2 to 4 am.',
          audience: { kind: 'SELECTED', garageIds: [g.garageId] },
          sendEmail: true,
        })
        .expect(201);
      expect(sent.body).toMatchObject({
        garages: 1,
        showing: true,
        showUntil: null,
        emailSent: true,
        sentBy: { id: superAdmin.adminId },
        garageList: [{ id: g.garageId }],
      });
      const id: string = sent.body.id;

      // One email, to the garage's owner, logged under that garage.
      const emails = await platform.notification.findMany({
        where: { refType: 'announcement', refId: id },
      });
      expect(emails).toHaveLength(1);
      expect(emails[0]).toMatchObject({
        garageId: g.garageId,
        userId: g.ownerId,
        type: 'ANNOUNCEMENT',
        channel: 'EMAIL',
        recipient: g.ownerEmail,
        template: 'announcement',
      });

      // The banner: this garage sees it, the other does not.
      const mine = await as(staff).get('/v1/announcements').expect(200);
      expect(mine.body).toEqual([
        expect.objectContaining({ id, title: 'Maintenance on Saturday' }),
      ]);
      const theirs = await as(otherStaff).get('/v1/announcements').expect(200);
      expect(theirs.body.map((m: { id: string }) => m.id)).not.toContain(id);
      await as(otherStaff).post(`/v1/announcements/${id}/dismiss`).expect(404);

      // Closing it hides it for this person, and the admin sees the count.
      await as(staff).post(`/v1/announcements/${id}/dismiss`).expect(204);
      await as(staff).post(`/v1/announcements/${id}/dismiss`).expect(204);
      expect((await as(staff).get('/v1/announcements').expect(200)).body).toEqual([]);
      const list = await su().get('/admin/v1/announcements').expect(200);
      expect(list.body.items.find((m: { id: string }) => m.id === id)).toMatchObject({
        dismissals: 1,
        emails: { sent: expect.any(Number), queued: expect.any(Number), failed: 0 },
      });
    });

    it('a status audience, no email, and ending the banner early', async () => {
      const sent = await su()
        .post('/admin/v1/announcements', {
          title: 'New feature: offers',
          body: 'Garages can now send offers to the owner app.',
          audience: { kind: 'STATUS', statuses: ['TRIAL', 'ACTIVE'] },
          sendEmail: false,
          showUntil: beirutToday(3),
        })
        .expect(201);
      const id: string = sent.body.id;
      expect(sent.body.garages).toBeGreaterThanOrEqual(2);
      expect(sent.body.showUntil).not.toBeNull();
      expect(await platform.notification.count({ where: { refId: id } })).toBe(0);
      for (const cookie of [staff, otherStaff]) {
        const res = await as(cookie).get('/v1/announcements').expect(200);
        expect(res.body.map((m: { id: string }) => m.id)).toContain(id);
      }

      const ended = await su().post(`/admin/v1/announcements/${id}/end`).expect(200);
      expect(ended.body.showing).toBe(false);
      const after = await as(staff).get('/v1/announcements').expect(200);
      expect(after.body.map((m: { id: string }) => m.id)).not.toContain(id);
    });

    it('refuses an audience with no garage and a last day already over', async () => {
      const none = await su()
        .post('/admin/v1/announcements', {
          title: 'Nobody',
          body: 'Nobody gets this.',
          audience: { kind: 'SELECTED', garageIds: [randomUUID()] },
          sendEmail: false,
        })
        .expect(409);
      expect(none.body.code).toBe('NO_GARAGES_MATCH');
      const past = await su()
        .post('/admin/v1/announcements', {
          title: 'Too late',
          body: 'This banner already ended.',
          audience: { kind: 'SELECTED', garageIds: [g.garageId] },
          sendEmail: false,
          showUntil: beirutToday(-1),
        })
        .expect(400);
      expect(past.body.code).toBe('VALIDATION_FAILED');
    });

    it("the email greets in the owner's language and keeps the admin's text", () => {
      const data = {
        name: 'Rami',
        garageName: 'Garage One',
        title: 'Maintenance',
        body: 'Down on Saturday.',
      };
      const ar = renderEmail('announcement', 'ar', data);
      expect(ar.subject).toBe('Maintenance');
      expect(ar.text).toContain('مرحباً Rami');
      expect(ar.text).toContain('Down on Saturday.');
      expect(renderEmail('announcement', 'en', data).text).toContain('owner of Garage One');
    });
  });
});
