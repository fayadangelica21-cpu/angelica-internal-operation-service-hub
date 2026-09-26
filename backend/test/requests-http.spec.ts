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
