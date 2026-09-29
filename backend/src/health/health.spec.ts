import { HealthService } from './health.service';
import { aiStatus } from './ai-status';
import { setLogWriter } from '../logging/log';

const entityMetadatas = [{ tableName: 'users' }, { tableName: 'requests' }, { tableName: 'request_status_history' }];
const driver = { escape: (name: string) => `"${name}"` };
const dsOk = { isInitialized: true, entityMetadatas, driver, query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
const dsDown = { isInitialized: true, entityMetadatas, driver, query: jest.fn().mockRejectedValue(Object.assign(new Error('password authentication failed for user "admin"'), { code: '28P01' })) };

describe('HealthService', () => {
  const lines: string[] = [];
  const env = { ...process.env };
  beforeEach(() => {
    lines.length = 0;
    setLogWriter((l) => lines.push(l));
    aiStatus.reset();
    process.env.AI_BASE_URL = 'https://provider.example/v1';
    process.env.AI_API_KEY = 'fake-key-for-test';
  });
  afterAll(() => {
    process.env = env;
    setLogWriter(null);
  });

  it('live never touches the database', () => {
    const svc = new HealthService(dsDown as never);
    expect(svc.live().status).toBe('ok');
    expect(dsDown.query).not.toHaveBeenCalled();
  });

  it('ready is 200/ok when database answers and the triage model is fine', async () => {
    const r = await new HealthService(dsOk as never).ready();
    expect(r.httpStatus).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', checks: { database: 'ok', triageModel: 'unknown' } });
  });

  it('ready is 503/down when the database fails, and the log holds the error code but not its message', async () => {
    const r = await new HealthService(dsDown as never).ready();
    expect(r.httpStatus).toBe(503);
    expect(r.body.status).toBe('down');
    const out = lines.join('\n');
    expect(out).toContain('28P01');
    expect(out).not.toContain('admin');
  });

  it('ready is down when the database responds but the application schema is missing', async () => {
    const missingTable = {
      isInitialized: true,
      entityMetadatas,
      driver,
      query: jest.fn().mockImplementation((sql: string) =>
        sql.includes('FROM "requests"')
          ? Promise.reject(Object.assign(new Error('relation does not exist'), { code: '42P01' }))
          : Promise.resolve([{ '?column?': 1 }]),
      ),
    };
    const r = await new HealthService(missingTable as never).ready();
    expect(r.httpStatus).toBe(503);
    expect(r.body).toMatchObject({ status: 'down', checks: { database: 'fail' } });
  });

  it('ready is 200/degraded when the triage model failed recently, and recovers after a success', async () => {
    const svc = new HealthService(dsOk as never);
    aiStatus.recordFailure('provider_timeout');
    const degraded = await svc.ready();
    expect(degraded.httpStatus).toBe(200);
    expect(degraded.body).toMatchObject({ status: 'degraded', checks: { database: 'ok', triageModel: 'unavailable' } });

    aiStatus.recordSuccess();
    const healthy = await svc.ready();
    expect(healthy.body.status).toBe('ok');
    expect(healthy.body.checks.triageModel).toBe('ok');
  });

  it('an old triage failure expires back to unknown (status ok)', () => {
    aiStatus.recordFailure('provider_5xx');
    expect(aiStatus.state(Date.now() + 11 * 60 * 1000)).toBe('unknown');
  });

  it('no provider configured is a normal fallback mode, not degraded', async () => {
    delete process.env.AI_BASE_URL;
    delete process.env.AI_API_KEY;
    const r = await new HealthService(dsOk as never).ready();
    expect(r.body).toMatchObject({ status: 'ok', checks: { triageModel: 'fallback' } });
  });

  it('logs health.check only when the status changes', async () => {
    const svc = new HealthService(dsOk as never);
    await svc.ready();
    await svc.ready();
    expect(lines.filter((l) => l.includes('health.check')).length).toBe(1);
  });
});

// HTTP-level check: routes are public and 503 is returned when the database is down.
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import { HealthController } from './health.controller';

describe('GET /health/* over HTTP', () => {
  async function appWith(ds: unknown): Promise<INestApplication> {
    const mod = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService, { provide: getDataSourceToken(), useValue: ds }],
    }).compile();
    const app = mod.createNestApplication();
    await app.init();
    return app;
  }

  it('/health/live is 200 without any token', async () => {
    const app = await appWith(dsDown);
    await request(app.getHttpServer()).get('/health/live').expect(200).expect((r) => expect(r.body.status).toBe('ok'));
    await app.close();
  }, 15000);

  it('/health/ready is 503 with status down when the database fails', async () => {
    const app = await appWith(dsDown);
    await request(app.getHttpServer()).get('/health/ready').expect(503).expect((r) => expect(r.body).toMatchObject({ status: 'down', checks: { database: 'fail' } }));
    await app.close();
  });

  it('/health/ready is 200 and never exposes secrets', async () => {
    const app = await appWith(dsOk);
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(JSON.stringify(res.body)).not.toMatch(/postgres|password|key/i);
    await app.close();
  });
});
