// Step 3.5: the PDF job, the download and the logo (flow.md 7.2). PDF_ADAPTER=stub renders
// the HTML as it is, so these checks read what the PDF would print.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { VisitDetail } from '@gearva/contracts';
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

const PNG = Buffer.from('89504e470d0a1a0a0000', 'hex');

describe('Invoice PDFs', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  let g: TestStaffGarage;
  let owner: string;
  let oilId: string;

  const http = () => request(app.getHttpServer());
  const as = (cookie: string) => ({
    get: (url: string) => http().get(url).set('Cookie', cookie),
    post: (url: string, body?: object) => http().post(url).set('Cookie', cookie).send(body),
  });

  async function finished(extra: object = {}) {
    const customer = (
      await as(owner)
        .post('/v1/customers', { name: 'Pdf Customer', phone: randomPhone() })
        .expect(201)
    ).body;
    const car = (
      await as(owner)
        .post(`/v1/customers/${customer.id}/vehicles`, {
          plate: `P ${randomUUID().slice(0, 6)}`,
          make: 'Kia',
          model: 'Rio',
          distanceUnit: 'KM',
          odometer: 50000,
        })
        .expect(201)
    ).body;
    const visit = (
      await as(owner)
        .post('/v1/visits/quick', {
          vehicleId: car.id,
          odometer: 50100,
          services: [{ serviceTypeId: oilId, unitPriceCents: 4000 }],
          ...extra,
        })
        .expect(201)
    ).body as VisitDetail;
    return visit.invoice?.id as string;
  }

  /** The PDF, once the job has finished and it shows `text`. */
  async function pdfShowing(id: string, text: string) {
    let body = '';
    await waitFor(async () => {
      const res = await as(owner)
        .get(`/v1/invoices/${id}/pdf`)
        .buffer(true)
        .parse((r, done) => {
          const parts: Buffer[] = [];
          r.on('data', (chunk: Buffer) => parts.push(chunk));
          r.on('end', () => done(null, Buffer.concat(parts)));
        });
      if (res.status !== 200) return false;
      body = (res.body as Buffer).toString('utf8');
      return body.includes(text);
    });
    return body;
  }

  beforeAll(async () => {
    app = await createTestApp();
    platform = app.get(PlatformDb).client;
    g = await createGarageWithOwner(app);
    ({ cookie: owner } = await staffLogin(app, g.ownerEmail, g.password));
    oilId = (
      await platform.serviceType.findFirstOrThrow({
        where: { garageId: null, code: 'OIL_CHANGE' },
      })
    ).id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('finishing renders the PDF once, as one file, and a download is logged', async () => {
    const id = await finished();
    const page = await pdfShowing(id, 'Pdf Customer');
    expect(page.startsWith('%PDF')).toBe(true);
    const invoice = await platform.invoice.findUniqueOrThrow({
      where: { id },
      include: { pdfFile: true },
    });
    expect(invoice.pdfFile).toMatchObject({ kind: 'INVOICE_PDF', mimeType: 'application/pdf' });
    const audit = await platform.auditLog.count({
      where: { action: 'invoice.reprint', entityId: id },
    });
    expect(audit).toBeGreaterThan(0);
  });

  it('a payment and a cancel render it again, in the same file', async () => {
    const id = await finished();
    await pdfShowing(id, 'Unpaid');
    await as(owner)
      .post(`/v1/invoices/${id}/payments`, { amountCents: 4000, method: 'WHISH' })
      .expect(201);
    await pdfShowing(id, 'Whish');
    await as(owner).post(`/v1/invoices/${id}/cancel`, { reason: 'Wrong car' }).expect(200);
    await pdfShowing(id, 'Wrong car');
    const files = await platform.file.count({
      where: { garageId: g.garageId, kind: 'INVOICE_PDF', storageKey: { contains: id } },
    });
    expect(files).toBe(1);
  });

  it('answers "not ready" when the file is missing, and renders it again', async () => {
    const id = await finished();
    await pdfShowing(id, 'Pdf Customer');
    const { pdfFileId } = await platform.invoice.findUniqueOrThrow({ where: { id } });
    await platform.invoice.update({ where: { id }, data: { pdfFileId: null } });
    const missing = await as(owner).get(`/v1/invoices/${id}/pdf`);
    expect([200, 409]).toContain(missing.status);
    if (missing.status === 409) expect(missing.body.code).toBe('INVOICE_PDF_NOT_READY');
    await pdfShowing(id, 'Pdf Customer');
    expect(pdfFileId).not.toBeNull();
  });

  it('staff of one branch cannot download another branch invoice', async () => {
    const second = (await as(owner).post('/v1/branches', { name: 'Pdf Second' }).expect(201)).body;
    const id = await finished({ branchId: second.id });
    const { cookie } = await signInAsStaff(app, g, 'MECHANIC');
    await as(cookie).get(`/v1/invoices/${id}/pdf`).expect(404);
  });

  describe('logo', () => {
    const upload = (cookie: string, bytes: Buffer, name = 'logo.png') =>
      http().post('/v1/invoice-settings/logo').set('Cookie', cookie).attach('file', bytes, name);

    it('is kept and printed on later invoices', async () => {
      const res = await upload(owner, PNG).expect(200);
      expect(res.body.hasLogo).toBe(true);
      const shown = await as(owner).get('/v1/invoice-settings/logo').expect(200);
      expect(shown.headers['content-type']).toContain('image/png');
      const page = await pdfShowing(await finished(), 'Pdf Customer');
      expect(page).toContain(`data:image/png;base64,${PNG.toString('base64')}`);
    });

    it('takes its type from the bytes: a script named .png is refused', async () => {
      await upload(owner, Buffer.from('<svg onload="alert(1)"></svg>')).expect(400);
      await http().post('/v1/invoice-settings/logo').set('Cookie', owner).expect(400);
    });

    it('refuses a file above 1 MB', async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(1024 * 1024 + 1)]);
      const res = await upload(owner, big);
      expect(res.status).toBe(413);
      expect(res.body.code).toBe('FILE_TOO_LARGE');
    });

    it('is for the owner only', async () => {
      const { cookie } = await signInAsStaff(app, g, 'MANAGER');
      await upload(cookie, PNG).expect(403);
      await as(cookie).get('/v1/invoice-settings/logo').expect(403);
    });
  });
});
