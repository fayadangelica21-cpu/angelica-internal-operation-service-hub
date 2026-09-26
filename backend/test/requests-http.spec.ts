jest.mock('firebase-admin/app', () => ({
  applicationDefault: jest.fn(() => ({})),
  getApp: jest.fn(() => ({})),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(() => ({})),
}));
jest.mock('firebase-admin/auth', () => ({ getAuth: jest.fn() }));

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { RequestsModule } from '../src/requests/requests.module';
import { RequestEntity } from '../src/requests/entities/request.entity';
import { UserEntity } from '../src/auth/user.entity';
import { FirebaseAuthService } from '../src/auth/firebase-auth.service';

describe('Requests HTTP boundaries', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [RequestEntity, UserEntity],
          synchronize: true,
        }),
        RequestsModule,
      ],
    })
      .overrideProvider(FirebaseAuthService)
      .useValue({
        authenticateToken: async (token: string) => {
          const [prefix, id, role = 'Employee', departmentId] = token.split(':');
          if (prefix !== 'test' || !id || !['Employee', 'Staff', 'Admin'].includes(role)) {
            throw new Error('Invalid test token');
          }
          return { id, role, departmentId: departmentId || undefined };
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const employeeHeaders = (id: string) => ({ Authorization: `Bearer test:${id}:Employee` });
  const staffHeaders = (id: string, departmentId: string) => ({
    Authorization: `Bearer test:${id}:Staff:${departmentId}`,
  });

  it('rejects a create payload with no description', async () => {
    await request(app.getHttpServer())
      .post('/requests')
      .set(employeeHeaders('EMP-001'))
      .send({ departmentId: 'DEPT-IT' })
      .expect(400);
  });

  it('rejects a whitespace-only description', async () => {
    await request(app.getHttpServer())
      .post('/requests')
      .set(employeeHeaders('EMP-001'))
      .send({ departmentId: 'DEPT-IT', description: '   ' })
      .expect(400);
  });

  it('returns 404 for a request that does not exist', async () => {
    await request(app.getHttpServer())
      .get('/requests/not-a-real-request')
      .set(employeeHeaders('EMP-001'))
      .expect(404);
  });

  it('allows an employee to create a request as themselves', async () => {
    const response = await request(app.getHttpServer())
      .post('/requests')
      .set(employeeHeaders('EMP-001'))
      .set('x-user-id', 'EMP-SPOOFED')
      .set('x-user-role', 'Admin')
      .send({ departmentId: 'DEPT-IT', description: 'Laptop screen flickers' })
      .expect(201);

    expect(response.body.requesterId).toBe('EMP-001');
    expect(response.body.status).toBe('Open');
  });

  it('denies another employee from reading that request', async () => {
    const created = await request(app.getHttpServer())
      .post('/requests')
      .set(employeeHeaders('EMP-001'))
      .send({ departmentId: 'DEPT-IT', description: 'Need a replacement keyboard' })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/requests/${created.body.id}`)
      .set(employeeHeaders('EMP-002'))
      .expect(403);
  });

  it('returns only active requests from the authenticated Staff member’s own department', async () => {
    const itRequest = await request(app.getHttpServer())
      .post('/requests')
      .set(employeeHeaders('EMP-021'))
      .send({ departmentId: 'DEPT-IT', description: 'IT queue item that should appear' })
      .expect(201);
    const hrRequest = await request(app.getHttpServer())
      .post('/requests')
      .set(employeeHeaders('EMP-020'))
      .send({ departmentId: 'DEPT-HR', description: 'HR queue item that must stay private' })
      .expect(201);
    const resolvedRequest = await request(app.getHttpServer())
      .post('/requests')
      .set(employeeHeaders('EMP-022'))
      .send({ departmentId: 'DEPT-IT', description: 'Resolved IT request' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/requests/${resolvedRequest.body.id}/assign`)
      .set(staffHeaders('STAFF-IT-1', 'DEPT-IT'))
      .send({ ownerId: 'STAFF-IT-1' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/requests/${resolvedRequest.body.id}/status`)
      .set(staffHeaders('STAFF-IT-1', 'DEPT-IT'))
      .send({ targetStatus: 'Resolved' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/requests/queue')
      .set(staffHeaders('STAFF-IT-1', 'DEPT-IT'))
      .expect(200);

    const returnedIds = response.body.map((item: { id: string }) => item.id);
    expect(returnedIds).toContain(itRequest.body.id);
    expect(returnedIds).not.toContain(hrRequest.body.id);
    expect(returnedIds).not.toContain(resolvedRequest.body.id);
    expect(response.body.every((item: { departmentId: string; status: string }) =>
      item.departmentId === 'DEPT-IT' && item.status !== 'Resolved')).toBe(true);
  });

  it('denies queue access to Employees, Admins, and Staff without a department assignment', async () => {
    await request(app.getHttpServer())
      .get('/requests/queue')
      .set(employeeHeaders('EMP-023'))
      .expect(403);
    await request(app.getHttpServer())
      .get('/requests/queue')
      .set({ Authorization: 'Bearer test:ADMIN-1:Admin' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/requests/queue')
      .set({ Authorization: 'Bearer test:STAFF-NO-DEPT:Staff' })
      .expect(403);
  });

  it('rejects calls without a verified bearer token even if identity headers are spoofed', async () => {
    await request(app.getHttpServer())
      .post('/requests')
      .set('x-user-id', 'EMP-001')
      .set('x-user-role', 'Employee')
      .send({ departmentId: 'DEPT-IT', description: 'Need a mouse' })
      .expect(401);
  });

  it('returns the identity derived from the verified token', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set(employeeHeaders('FIREBASE-UID-123'))
      .set('x-user-id', 'SPOOFED')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ id: 'FIREBASE-UID-123', role: 'Employee' });
      });
  });

  it('returns the backend-owned triage contract for a valid employee request', async () => {
    const response = await request(app.getHttpServer())
      .post('/triage')
      .set(employeeHeaders('EMP-001'))
      .send({ description: 'Laptop screen flickers', selectedDepartmentId: 'DEPT-IT' })
      .expect(201);

    expect(response.body).toMatchObject({
      draftId: expect.any(String),
      departmentId: 'DEPT-IT',
      issueType: expect.any(String),
      suggestedNextStep: expect.any(String),
      confidence: expect.any(Number),
      requiresMoreInfo: expect.any(Boolean),
      classification: expect.any(String),
      reasoning: expect.any(String),
    });
    expect(response.body.confidence).toBeGreaterThanOrEqual(0);
    expect(response.body.confidence).toBeLessThanOrEqual(1);
  });
});
