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
});
