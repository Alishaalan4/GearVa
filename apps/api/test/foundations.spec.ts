// Step 1.2 foundations through the real HTTP stack, real Postgres and real Redis:
// error shape, validation, pagination, tenant context + RLS wrapper, audit rows.
import {
  Controller,
  Get,
  Headers,
  type INestApplication,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import request from 'supertest';
import { Audit } from '../src/audit/audit.decorator';
import { RequestContext } from '../src/common/context/request-context';
import { PlatformDb } from '../src/common/db/platform-db';
import { TenantDb } from '../src/common/db/tenant-db';
import { PaginationQueryDto, paginated, toSkipTake } from '../src/common/pagination';
import { createTestApp } from './helpers/app';
import { createTestGarages } from './helpers/garages';

/**
 * Test-only endpoints. The real auth guards (steps 1.4/1.6) will set the actor from a
 * verified token; here a header stands in for it.
 */
@Controller('probe')
class ProbeController {
  constructor(
    private readonly context: RequestContext,
    private readonly db: TenantDb,
  ) {}

  private actAs(garageId: string | undefined) {
    if (!garageId) return;
    this.context.setActor({ type: 'STAFF', id: null, garageId, role: 'OWNER', branchId: null });
  }

  // Deliberately no `where: { garageId }` here: this proves RLS alone keeps garages apart.
  @Get('branches')
  async branches(@Headers('x-test-garage') garageId: string, @Query() query: PaginationQueryDto) {
    this.actAs(garageId);
    const [items, total] = await this.db.run((tx) =>
      Promise.all([tx.branch.findMany({ ...toSkipTake(query) }), tx.branch.count()]),
    );
    return paginated(items, total, query);
  }

  @Post('touch')
  @Audit('probe.touch', 'branch')
  async touch(@Headers('x-test-garage') garageId: string) {
    this.actAs(garageId);
    const branch = await this.db.run((tx) => tx.branch.findFirstOrThrow());
    return { id: branch.id };
  }
}

describe('API foundations', () => {
  let app: INestApplication;
  let platform: PlatformDb['client'];
  let garageA: string;
  let garageB: string;

  beforeAll(async () => {
    app = await createTestApp([ProbeController]);
    platform = app.get(PlatformDb).client;
    ({ garageA, garageB } = await createTestGarages(platform));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health answers ok', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });

  it('unknown routes use the error shape with NOT_FOUND', async () => {
    const res = await request(app.getHttpServer()).get('/does-not-exist').expect(404);
    expect(res.body).toEqual({ code: 'NOT_FOUND', message: expect.any(String), details: {} });
  });

  it('pageSize above 50 is rejected with VALIDATION_FAILED', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe/branches?pageSize=500')
      .set('x-test-garage', garageA)
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.details.issues.length).toBeGreaterThan(0);
  });

  it('garage A only sees garage A, with the pagination shape', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe/branches')
      .set('x-test-garage', garageA)
      .expect(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect(res.body.items.map((b: { garageId: string }) => b.garageId)).toEqual([garageA]);
  });

  it('garage B only sees garage B', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe/branches')
      .set('x-test-garage', garageB)
      .expect(200);
    expect(res.body.items.map((b: { garageId: string }) => b.garageId)).toEqual([garageB]);
  });

  it('a tenant query without a tenant context fails closed', async () => {
    // The filter logs unknown errors; capture it here instead of printing it.
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const res = await request(app.getHttpServer()).get('/probe/branches').expect(500);
      expect(res.body).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        details: {},
      });
      // The client sees nothing internal, but the server log has the real reason.
      expect(logged).toHaveBeenCalledWith(expect.stringContaining('No tenant context'));
    } finally {
      logged.mockRestore();
    }
  });

  it('a mutating request writes one audit row in the right garage', async () => {
    const res = await request(app.getHttpServer())
      .post('/probe/touch')
      .set('x-test-garage', garageA)
      .expect(201);

    const rows = await platform.auditLog.findMany({
      where: { action: 'probe.touch', garageId: garageA },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorType: 'STAFF',
      entityType: 'branch',
      entityId: res.body.id,
    });
  });
});
