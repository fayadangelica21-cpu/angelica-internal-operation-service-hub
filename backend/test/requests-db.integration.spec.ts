import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestEntity } from '../src/requests/entities/request.entity';
import { RequestStatus } from '../src/requests/enums/request-status.enum';
import { RequestStateMachineService } from '../src/requests/request-state-machine.service';
import { RequestsService } from '../src/requests/requests.service';

describe('RequestsService database integration', () => {
  let service: RequestsService;
  let repository: Repository<RequestEntity>;
  let moduleRef: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [RequestEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([RequestEntity]),
      ],
      providers: [RequestsService, RequestStateMachineService],
    }).compile();
    service = moduleRef.get(RequestsService);
    repository = moduleRef.get(getRepositoryToken(RequestEntity));
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('persists a newly submitted request and can read the durable row back from the database', async () => {
    const created = await service.create(
      { id: 'EMP-001', role: 'Employee' },
      { departmentId: 'DEPT-IT', description: 'Laptop screen flickers' },
    );
    const stored = await repository.findOneByOrFail({ id: created.id });

    expect(stored.requesterId).toBe('EMP-001');
    expect(stored.status).toBe(RequestStatus.OPEN);
    expect(stored.description).toBe('Laptop screen flickers');
  });

  it('queries the active queue using the authenticated Staff department', async () => {
    const itRequest = await service.create(
      { id: 'EMP-IT-QUEUE', role: 'Employee' },
      { departmentId: 'DEPT-IT', description: 'IT queue integration record' },
    );
    const hrRequest = await service.create(
      { id: 'EMP-HR-QUEUE', role: 'Employee' },
      { departmentId: 'DEPT-HR', description: 'HR record must not leak into IT queue' },
    );

    const queue = await service.getDepartmentQueue({
      id: 'STAFF-IT-QUEUE',
      role: 'Staff',
      departmentId: 'DEPT-IT',
    });
    const queueIds = queue.map((request) => request.id);

    expect(queueIds).toContain(itRequest.id);
    expect(queueIds).not.toContain(hrRequest.id);
    expect(queue.every((request) => request.departmentId === 'DEPT-IT')).toBe(true);
    expect(queue.every((request) => request.status !== RequestStatus.RESOLVED)).toBe(true);
  });

  it('persists ownership and the status transitions from Open to In Progress to Resolved', async () => {
    const created = await service.create(
      { id: 'EMP-LIFECYCLE', role: 'Employee' },
      { departmentId: 'DEPT-IT', description: 'Persist staff processing lifecycle' },
    );
    const staff = { id: 'STAFF-IT-LIFECYCLE', role: 'Staff' as const, departmentId: 'DEPT-IT' };

    const assigned = await service.assign(staff, created.id, { ownerId: staff.id });
    expect(assigned).toMatchObject({ ownerId: staff.id, status: RequestStatus.IN_PROGRESS });

    const storedInProgress = await repository.findOneByOrFail({ id: created.id });
    expect(storedInProgress.ownerId).toBe(staff.id);
    expect(storedInProgress.status).toBe(RequestStatus.IN_PROGRESS);

    const resolved = await service.transitionStatus(staff, created.id, {
      targetStatus: RequestStatus.RESOLVED,
    });
    const storedResolved = await repository.findOneByOrFail({ id: created.id });
    expect(resolved.status).toBe(RequestStatus.RESOLVED);
    expect(storedResolved.status).toBe(RequestStatus.RESOLVED);
  });

  it('moves a newly claimed request above newer unclaimed requests in the department queue', async () => {
    const claimedRequest = await service.create(
      { id: 'EMP-OLDER-REQUEST', role: 'Employee' },
      { departmentId: 'DEPT-IT', description: 'Older request that Staff will claim' },
    );
    const oldDate = new Date('2000-01-01T00:00:00.000Z');
    await repository.update(claimedRequest.id, { createdAt: oldDate, updatedAt: oldDate });

    const newerRequest = await service.create(
      { id: 'EMP-NEWER-REQUEST', role: 'Employee' },
      { departmentId: 'DEPT-IT', description: 'Newer request that remains open' },
    );
    const staff = { id: 'STAFF-IT-QUEUE-ORDER', role: 'Staff' as const, departmentId: 'DEPT-IT' };
    await service.assign(staff, claimedRequest.id, { ownerId: staff.id });

    const queue = await service.getDepartmentQueue(staff);
    expect(queue[0].id).toBe(claimedRequest.id);
    expect(queue.map((request) => request.id)).toContain(newerRequest.id);
  });
});
