import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestEntity } from '../src/requests/entities/request.entity';
import { RequestStatusHistoryEntity } from '../src/requests/entities/request-status-history.entity';
import { UserEntity } from '../src/auth/user.entity';
import { RequestStatus } from '../src/requests/enums/request-status.enum';
import { RequestStateMachineService } from '../src/requests/request-state-machine.service';
import { RequestsService } from '../src/requests/requests.service';

describe('RequestsService database integration', () => {
  let service: RequestsService;
  let repository: Repository<RequestEntity>;
  let usersRepository: Repository<UserEntity>;
  let moduleRef: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [RequestEntity, RequestStatusHistoryEntity, UserEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([RequestEntity, RequestStatusHistoryEntity, UserEntity]),
      ],
      providers: [RequestsService, RequestStateMachineService],
    }).compile();
    service = moduleRef.get(RequestsService);
    repository = moduleRef.get(getRepositoryToken(RequestEntity));
    usersRepository = moduleRef.get(getRepositoryToken(UserEntity));
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('persists a newly submitted request and can read the durable row back from the database', async () => {
    const created = await service.create(
      { id: 'EMP-001', role: 'Employee' },
      { departmentId: 'DEPT-IT', description: 'Laptop screen flickers', expectedResolutionDate: '2026-10-15T17:30:00.000Z' },
    );
    const stored = await repository.findOneByOrFail({ id: created.id });

    expect(stored.requesterId).toBe('EMP-001');
    expect(stored.status).toBe(RequestStatus.OPEN);
    expect(stored.description).toBe('Laptop screen flickers');
    expect(stored.expectedResolutionDate).toBe('2026-10-15T17:30:00.000Z');
  });

  it('returns only requests owned by the authenticated Employee', async () => {
    const ownRequest = await service.create(
      { id: 'EMP-OWN-LIST', role: 'Employee' },
      { departmentId: 'DEPT-IT', description: 'Request visible in my list' },
    );
    const anotherEmployeesRequest = await service.create(
      { id: 'EMP-OTHER-LIST', role: 'Employee' },
      { departmentId: 'DEPT-HR', description: 'Request must remain private' },
    );

    const ownRequests = await service.getOwnRequests({ id: 'EMP-OWN-LIST', role: 'Employee' });

    expect(ownRequests.map((request) => request.id)).toContain(ownRequest.id);
    expect(ownRequests.map((request) => request.id)).not.toContain(anotherEmployeesRequest.id);
    expect(ownRequests.every((request) => request.requesterId === 'EMP-OWN-LIST')).toBe(true);
  });

  it('includes an overdue indicator only for the Employee’s own active requests', async () => {
    const pastDeadline = new Date(Date.now() - 60_000).toISOString();
    const overdue = await service.create(
      { id: 'EMP-FR9-OWN', role: 'Employee' },
      { departmentId: 'DEPT-IT', description: 'My overdue request', expectedResolutionDate: pastDeadline },
    );
    const resolved = await service.create(
      { id: 'EMP-FR9-OWN', role: 'Employee' },
      { departmentId: 'DEPT-HR', description: 'My resolved request', expectedResolutionDate: pastDeadline },
    );
    await repository.update(resolved.id, { status: RequestStatus.RESOLVED });
    const anotherEmployeesOverdue = await service.create(
      { id: 'EMP-FR9-OTHER', role: 'Employee' },
      { departmentId: 'DEPT-FINANCE', description: 'Another employee’s overdue request', expectedResolutionDate: pastDeadline },
    );

    const ownRequests = await service.getOwnRequests({ id: 'EMP-FR9-OWN', role: 'Employee' });
    const statuses = new Map(ownRequests.map((item) => [item.id, item.deadlineStatus]));

    expect(statuses.get(overdue.id)).toBe('overdue');
    expect(statuses.get(resolved.id)).toBeNull();
    expect(statuses.has(anotherEmployeesOverdue.id)).toBe(false);
  });

  it('enforces database-backed request detail access by requester, department, and Admin role', async () => {
    const itRequest = await service.create(
      { id: 'EMP-DETAIL-IT', role: 'Employee' },
      { departmentId: 'DEPT-IT', description: 'Private IT detail record' },
    );
    const hrRequest = await service.create(
      { id: 'EMP-DETAIL-HR', role: 'Employee' },
      { departmentId: 'DEPT-HR', description: 'Private HR detail record' },
    );

    await expect(service.findOne({ id: 'EMP-DETAIL-IT', role: 'Employee' }, itRequest.id)).resolves.toMatchObject({
      id: itRequest.id,
    });
    await expect(service.findOne({ id: 'EMP-DETAIL-HR', role: 'Employee' }, itRequest.id)).rejects.toThrow();
    await expect(service.findOne({ id: 'STAFF-DETAIL-IT', role: 'Staff', departmentId: 'DEPT-IT' }, itRequest.id))
      .resolves.toMatchObject({ id: itRequest.id });
    await expect(service.findOne({ id: 'STAFF-DETAIL-HR', role: 'Staff', departmentId: 'DEPT-HR' }, itRequest.id))
      .rejects.toThrow();
    await expect(service.findOne({ id: 'STAFF-DETAIL-IT', role: 'Staff', departmentId: 'DEPT-IT' }, hrRequest.id))
      .rejects.toThrow();
    await expect(service.findOne({ id: 'ADMIN-DETAIL', role: 'Admin' }, hrRequest.id)).resolves.toMatchObject({
      id: hrRequest.id,
    });
  });

  it('queries the active queue using the authenticated Staff department', async () => {
    const itRequest = await service.create(
      { id: 'EMP-IT-QUEUE', role: 'Employee' },
      { departmentId: 'DEPT-IT', description: 'IT queue integration record', expectedResolutionDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() },
    );
    const hrRequest = await service.create(
      { id: 'EMP-HR-QUEUE', role: 'Employee' },
      { departmentId: 'DEPT-HR', description: 'HR record must not leak into IT queue' },
    );
    const recentOverdueRequest = await service.create(
      { id: 'EMP-IT-RECENT-OVERDUE', role: 'Employee' },
      { departmentId: 'DEPT-IT', description: 'Recent overdue request', expectedResolutionDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
    );
    const expiredOverdueRequest = await service.create(
      { id: 'EMP-IT-EXPIRED-OVERDUE', role: 'Employee' },
      { departmentId: 'DEPT-IT', description: 'Overdue for more than a week', expectedResolutionDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() },
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
    expect(queue.find((request) => request.id === itRequest.id)?.deadlineStatus).toBe('due-soon');
    expect(queue.map((request) => request.id)).not.toContain(recentOverdueRequest.id);
    expect(queue.map((request) => request.id)).not.toContain(expiredOverdueRequest.id);

    const overdueQueue = await service.getOverdueDepartmentQueue({
      id: 'STAFF-IT-QUEUE',
      role: 'Staff',
      departmentId: 'DEPT-IT',
    });
    expect(overdueQueue.map((request) => request.id)).toContain(recentOverdueRequest.id);
    expect(overdueQueue.find((request) => request.id === recentOverdueRequest.id)?.deadlineStatus).toBe('overdue');
    expect(overdueQueue.map((request) => request.id)).not.toContain(expiredOverdueRequest.id);
    expect(overdueQueue.map((request) => request.id)).not.toContain(hrRequest.id);
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

    const [employeeRequest] = await service.getOwnRequests({ id: 'EMP-LIFECYCLE', role: 'Employee' });
    expect(employeeRequest.statusHistory.map(({ fromStatus, toStatus }) => [fromStatus, toStatus])).toEqual([
      [null, RequestStatus.OPEN],
      [RequestStatus.OPEN, RequestStatus.IN_PROGRESS],
      [RequestStatus.IN_PROGRESS, RequestStatus.RESOLVED],
    ]);
    expect(employeeRequest.statusHistory.every(({ changedAt }) => changedAt instanceof Date)).toBe(true);
    expect(employeeRequest.statusHistory[1]).not.toHaveProperty('changedByUserId');
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

  it('lets an Admin assign and reassign a request only to Staff in its department', async () => {
    const request = await service.create(
      { id: 'EMP-ADMIN-ASSIGNMENT', role: 'Employee' },
      { departmentId: 'DEPT-HR', description: 'Request for Admin staff assignment' },
    );
    const staff = [
      { id: 'STAFF-HR-ASSIGN-1', email: 'hr.one@example.test', displayName: 'HR One', role: 'Staff' as const, departmentId: 'DEPT-HR' },
      { id: 'STAFF-HR-ASSIGN-2', email: 'hr.two@example.test', displayName: 'HR Two', role: 'Staff' as const, departmentId: 'DEPT-HR' },
      { id: 'STAFF-IT-ASSIGN', email: 'it.staff@example.test', displayName: 'IT Staff', role: 'Staff' as const, departmentId: 'DEPT-IT' },
    ];
    await usersRepository.save(staff);
    const admin = { id: 'ADMIN-ASSIGNMENT', role: 'Admin' as const };

    const candidates = await service.getAssignableStaff(admin, request.id);
    expect(candidates.map((candidate) => candidate.id)).toEqual(['STAFF-HR-ASSIGN-1', 'STAFF-HR-ASSIGN-2']);

    const assigned = await service.assign(admin, request.id, { ownerId: 'STAFF-HR-ASSIGN-1' });
    expect(assigned).toMatchObject({ ownerId: 'STAFF-HR-ASSIGN-1', status: RequestStatus.IN_PROGRESS });

    const reassigned = await service.assign(admin, request.id, { ownerId: 'STAFF-HR-ASSIGN-2' });
    expect(reassigned).toMatchObject({ ownerId: 'STAFF-HR-ASSIGN-2', status: RequestStatus.IN_PROGRESS });

    await expect(service.assign(admin, request.id, { ownerId: 'STAFF-IT-ASSIGN' })).rejects.toThrow(
      'Choose a Staff member assigned to the request department.',
    );
  });

  it('moves an active request to its new department queue and releases its previous owner', async () => {
    const request = await service.create(
      { id: 'EMP-WRONG-DEPARTMENT', role: 'Employee' },
      { departmentId: 'DEPT-IT', description: 'Request needs HR support' },
    );
    const itStaff = { id: 'STAFF-IT-MOVE', role: 'Staff' as const, departmentId: 'DEPT-IT' };
    const hrStaff = { id: 'STAFF-HR-MOVE', role: 'Staff' as const, departmentId: 'DEPT-HR' };
    await service.assign(itStaff, request.id, { ownerId: itStaff.id });

    const moved = await service.reassignDepartment(
      { id: 'ADMIN-MOVE', role: 'Admin' },
      request.id,
      { departmentId: 'DEPT-HR' },
    );

    expect(moved).toMatchObject({ departmentId: 'DEPT-HR', ownerId: null, status: RequestStatus.OPEN });
    expect((await service.getDepartmentQueue(itStaff)).map((item) => item.id)).not.toContain(request.id);
    expect((await service.getDepartmentQueue(hrStaff)).map((item) => item.id)).toContain(request.id);
    const [employeeRequest] = await service.getOwnRequests({ id: 'EMP-WRONG-DEPARTMENT', role: 'Employee' });
    expect(employeeRequest.statusHistory.map(({ fromStatus, toStatus }) => [fromStatus, toStatus])).toEqual([
      [null, RequestStatus.OPEN],
      [RequestStatus.OPEN, RequestStatus.IN_PROGRESS],
      [RequestStatus.IN_PROGRESS, RequestStatus.OPEN],
    ]);
  });

  it('returns all departments with readable owners only for Admins', async () => {
    const itRequest = await service.create(
      { id: 'EMP-ADMIN-LIST-IT', role: 'Employee' },
      { departmentId: 'DEPT-IT', description: 'IT request for Admin overview' },
    );
    const financeRequest = await service.create(
      { id: 'EMP-ADMIN-LIST-FINANCE', role: 'Employee' },
      { departmentId: 'DEPT-FINANCE', description: 'Finance request for Admin overview' },
    );
    await usersRepository.save({
      id: 'STAFF-FINANCE-ADMIN-LIST',
      email: 'finance.staff@example.test',
      displayName: 'Finance Staff',
      role: 'Staff',
      departmentId: 'DEPT-FINANCE',
    });
    await service.assign(
      { id: 'ADMIN-LIST', role: 'Admin' },
      financeRequest.id,
      { ownerId: 'STAFF-FINANCE-ADMIN-LIST' },
    );

    const requests = await service.getAllRequestsForAdmin({ id: 'ADMIN-LIST', role: 'Admin' });
    expect(requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: itRequest.id, departmentId: 'DEPT-IT', ownerDisplayName: null }),
      expect.objectContaining({ id: financeRequest.id, departmentId: 'DEPT-FINANCE', ownerDisplayName: 'Finance Staff' }),
    ]));
    await expect(service.getAllRequestsForAdmin({ id: 'STAFF-IT-LIST', role: 'Staff', departmentId: 'DEPT-IT' }))
      .rejects.toThrow('Only Admins can view requests across all departments.');
  });

  it('derives overdue and due-soon states for active requests and excludes resolved requests', async () => {
    const now = Date.now();
    const createWithDeadline = (id: string, deadline: number) => service.create(
      { id: `EMP-${id}`, role: 'Employee' },
      {
        departmentId: 'DEPT-IT',
        description: `${id} deadline case`,
        expectedResolutionDate: new Date(deadline).toISOString(),
      },
    );
    const overdue = await createWithDeadline('FR9-OVERDUE', now - 60_000);
    const dueSoon = await createWithDeadline('FR9-DUE-SOON', now + 2 * 60 * 60 * 1000);
    const outsideWarningWindow = await createWithDeadline('FR9-NOT-DUE-SOON', now + 4 * 60 * 60 * 1000);
    const resolved = await createWithDeadline('FR9-RESOLVED', now - 60_000);
    await repository.update(resolved.id, { status: RequestStatus.RESOLVED });

    const requests = await service.getAllRequestsForAdmin({ id: 'ADMIN-FR9', role: 'Admin' });
    const deadlineStatus = new Map(requests.map((item) => [item.id, item.deadlineStatus]));

    expect(deadlineStatus.get(overdue.id)).toBe('overdue');
    expect(deadlineStatus.get(dueSoon.id)).toBe('due-soon');
    expect(deadlineStatus.get(outsideWarningWindow.id)).toBeNull();
    expect(deadlineStatus.get(resolved.id)).toBeNull();
  });

  it('aggregates active workload by department and Staff member while excluding resolved requests', async () => {
    await usersRepository.save([
      { id: 'STAFF-WORKLOAD-IT', email: 'it.workload@example.test', displayName: 'IT Workload', role: 'Staff', departmentId: 'DEPT-IT' },
      { id: 'STAFF-WORKLOAD-HR', email: 'hr.workload@example.test', displayName: 'HR Workload', role: 'Staff', departmentId: 'DEPT-HR' },
    ]);

    const before = await service.getAdminWorkload({ id: 'ADMIN-WORKLOAD', role: 'Admin' });
    const unassignedItRequests = [];
    for (const index of [1, 2]) {
      unassignedItRequests.push(await service.create(
        { id: `EMP-WORKLOAD-IT-OPEN-${index}`, role: 'Employee' },
        { departmentId: 'DEPT-IT', description: `Unassigned IT workload ${index}` },
      ));
    }
    const assignedItRequests = [];
    for (const index of [1, 2]) {
      assignedItRequests.push(await service.create(
        { id: `EMP-WORKLOAD-IT-ACTIVE-${index}`, role: 'Employee' },
        { departmentId: 'DEPT-IT', description: `Assigned IT workload ${index}` },
      ));
    }
    for (const item of assignedItRequests) {
      await service.assign({ id: 'ADMIN-WORKLOAD', role: 'Admin' }, item.id, { ownerId: 'STAFF-WORKLOAD-IT' });
    }
    const unassignedHrRequest = await service.create(
      { id: 'EMP-WORKLOAD-HR-OPEN', role: 'Employee' },
      { departmentId: 'DEPT-HR', description: 'Unassigned HR workload' },
    );
    const resolvedFinanceRequest = await service.create(
      { id: 'EMP-WORKLOAD-FINANCE-RESOLVED', role: 'Employee' },
      { departmentId: 'DEPT-FINANCE', description: 'Resolved workload must not be counted' },
    );
    const financeStaff = { id: 'STAFF-WORKLOAD-FINANCE', role: 'Staff' as const, departmentId: 'DEPT-FINANCE' };
    await service.assign(financeStaff, resolvedFinanceRequest.id, { ownerId: financeStaff.id });
    await service.transitionStatus(financeStaff, resolvedFinanceRequest.id, { targetStatus: RequestStatus.RESOLVED });

    const workload = await service.getAdminWorkload({ id: 'ADMIN-WORKLOAD', role: 'Admin' });
    const itBefore = before.departments.find((item) => item.departmentId === 'DEPT-IT')!;
    const itAfter = workload.departments.find((item) => item.departmentId === 'DEPT-IT')!;
    expect(itAfter).toMatchObject({
      activeRequestCount: itBefore.activeRequestCount + unassignedItRequests.length + assignedItRequests.length,
      openRequestCount: itBefore.openRequestCount + unassignedItRequests.length,
      inProgressRequestCount: itBefore.inProgressRequestCount + assignedItRequests.length,
      unassignedRequestCount: itBefore.unassignedRequestCount + unassignedItRequests.length,
    });
    const hrBefore = before.departments.find((item) => item.departmentId === 'DEPT-HR')!;
    const hrAfter = workload.departments.find((item) => item.departmentId === 'DEPT-HR')!;
    expect(hrAfter).toMatchObject({
      activeRequestCount: hrBefore.activeRequestCount + 1,
      openRequestCount: hrBefore.openRequestCount + 1,
      unassignedRequestCount: hrBefore.unassignedRequestCount + 1,
    });
    const itStaff = workload.staff.find((item) => item.staffId === 'STAFF-WORKLOAD-IT')!;
    expect(itStaff).toMatchObject({
      staffName: 'IT Workload',
      departmentId: 'DEPT-IT',
      activeRequestCount: 2,
      inProgressRequestCount: 2,
    });
    expect(workload.staff.find((item) => item.staffId === 'STAFF-WORKLOAD-HR')).toMatchObject({
      staffName: 'HR Workload',
      activeRequestCount: 0,
    });
    expect(workload.departments.find((item) => item.departmentId === 'DEPT-FINANCE')).toMatchObject(
      before.departments.find((item) => item.departmentId === 'DEPT-FINANCE'),
    );
  });
});
