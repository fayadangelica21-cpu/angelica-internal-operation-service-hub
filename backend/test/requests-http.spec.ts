import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { RequestsModule } from '../src/requests/requests.module';
import { RequestEntity } from '../src/requests/entities/request.entity';

describe('Requests HTTP boundaries', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [RequestEntity],
          synchronize: true,
        }),
        RequestsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const employeeHeaders = (id: string) => ({
    'x-user-id': id,
    'x-user-role': 'Employee',
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

  it('rejects calls without identity headers', async () => {
    await request(app.getHttpServer())
      .post('/requests')
      .send({ departmentId: 'DEPT-IT', description: 'Need a mouse' })
      .expect(403);
  });
});
