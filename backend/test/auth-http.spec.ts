jest.mock('firebase-admin/app', () => ({
  applicationDefault: jest.fn(() => ({})),
  getApp: jest.fn(() => ({})),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(() => ({})),
}));
jest.mock('firebase-admin/auth', () => ({ getAuth: jest.fn() }));

import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AuthModule } from '../src/auth/auth.module';
import { FirebaseAuthService } from '../src/auth/firebase-auth.service';
import { UserEntity } from '../src/auth/user.entity';
import { CurrentUserData } from '../src/requests/current-user';
import { requestLogger } from '../src/logging/request-logger';
import { setLogWriter } from '../src/logging/log';

describe('Firebase-authenticated local user profiles', () => {
  let app: INestApplication;
  let usersRepository: Repository<UserEntity>;
  const logLines: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [UserEntity],
          synchronize: true,
        }),
        AuthModule,
      ],
    })
      .overrideProvider(FirebaseAuthService)
      .useValue({
        async authenticateToken(token: string): Promise<CurrentUserData> {
          if (token === 'employee-token') {
            return { id: 'FIREBASE-EMPLOYEE-UID', email: 'employee@example.test', displayName: 'Demo Employee', role: 'Employee' };
          }
          if (token === 'staff-token') {
            return { id: 'FIREBASE-STAFF-UID', email: 'it@example.test', displayName: 'IT Staff', role: 'Staff', departmentId: 'DEPT-IT' };
          }
          throw new UnauthorizedException('Invalid test token.');
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.use(requestLogger);
    await app.init();
    usersRepository = moduleRef.get(getRepositoryToken(UserEntity));
    setLogWriter((line) => logLines.push(line));
  });

  afterAll(async () => {
    await app.close();
    setLogWriter(null);
  });

  it('creates a local SQLite profile from a verified employee identity without storing credentials', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer employee-token')
      .expect(200);

    expect(response.body).toMatchObject({
      id: 'FIREBASE-EMPLOYEE-UID',
      email: 'employee@example.test',
      displayName: 'Demo Employee',
      role: 'Employee',
    });

    const saved = await usersRepository.findOneByOrFail({ id: 'FIREBASE-EMPLOYEE-UID' });
    expect(saved).toMatchObject({
      id: 'FIREBASE-EMPLOYEE-UID',
      email: 'employee@example.test',
      displayName: 'Demo Employee',
      role: 'Employee',
      departmentId: null,
    });
    expect(saved).not.toHaveProperty('password');
  });

  it('persists the server-resolved staff role and department for the Firebase UID', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer staff-token')
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ id: 'FIREBASE-STAFF-UID', role: 'Staff', departmentId: 'DEPT-IT' }));

    const saved = await usersRepository.findOneByOrFail({ id: 'FIREBASE-STAFF-UID' });
    expect(saved.role).toBe('Staff');
    expect(saved.departmentId).toBe('DEPT-IT');
  });

  it('does not create a local profile without a verified Firebase bearer token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    expect(await usersRepository.count()).toBe(2);
  });

  it('does not include a rejected token or request body in HTTP logs', async () => {
    const fakeToken = 'eyJhbGciOiJSUzI1NiJ9.eyJ1aWQiOiJmYWtlLXVpZCJ9.c2lnbmF0dXJl';
    const fakeSecret = 'body-password-should-never-be-logged';
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${fakeToken}`)
      .send({ description: 'private employee text', password: fakeSecret })
      .expect(401);

    const logs = logLines.join('\n');
    expect(logs).toContain('auth.rejected');
    expect(logs).not.toContain(fakeToken);
    expect(logs).not.toContain(fakeSecret);
    expect(logs).not.toContain('private employee text');
  });
});
