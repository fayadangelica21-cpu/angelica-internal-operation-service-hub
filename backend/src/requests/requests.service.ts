import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { CurrentUserData } from './current-user';
import { AssignRequestDto } from './dto/assign-request.dto';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { ReassignRequestDepartmentDto } from './dto/reassign-request-department.dto';
import { RequestEntity } from './entities/request.entity';
import { RequestStatusHistoryEntity } from './entities/request-status-history.entity';
import { RequestStatus } from './enums/request-status.enum';
import { RequestStateMachineService } from './request-state-machine.service';
import { UserEntity } from '../auth/user.entity';

type RequestUpdateCriteria = Parameters<Repository<RequestEntity>['update']>[0];
type RequestUpdateValues = Parameters<Repository<RequestEntity>['update']>[1];

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(RequestEntity)
    private readonly requestsRepository: Repository<RequestEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(RequestStatusHistoryEntity)
    private readonly statusHistoryRepository: Repository<RequestStatusHistoryEntity>,
    private readonly stateMachineService: RequestStateMachineService,
  ) {}

  async create(user: CurrentUserData, dto: CreateRequestDto): Promise<RequestEntity> {
    if (user.role !== 'Employee') {
      throw new ForbiddenException('Only employees can submit a new request in this slice.');
    }

    return this.requestsRepository.manager.transaction(async (manager) => {
      const requests = manager.getRepository(RequestEntity);
      const request = await requests.save(requests.create({
        departmentId: dto.departmentId,
        requesterId: user.id,
        description: dto.description,
        status: RequestStatus.OPEN,
        ownerId: null,
      }));
      const history = manager.getRepository(RequestStatusHistoryEntity);
      await history.save(history.create({
        requestId: request.id,
        fromStatus: null,
        toStatus: RequestStatus.OPEN,
        changedByUserId: user.id,
        changedAt: request.createdAt,
      }));
      return request;
    });
  }

  async findOne(user: CurrentUserData, id: string): Promise<RequestEntity> {
    const request = await this.requestsRepository.findOneBy({ id });
    if (!request) throw new NotFoundException(`Request with ID ${id} not found.`);
    this.assertCanAccess(user, request);
    return request;
  }

  async getOwnRequests(user: CurrentUserData) {
    if (user.role !== 'Employee') {
      throw new ForbiddenException('Only employees can view their own requests.');
    }
    const requests = await this.requestsRepository.find({
      where: { requesterId: user.id },
      relations: { statusHistory: true },
      order: { createdAt: 'DESC' },
    });
    return requests.map((request) => {
      const { statusHistory = [], ...requestDetails } = request;
      return {
        ...requestDetails,
        statusHistory: statusHistory
          .slice()
          .sort((left, right) => left.changedAt.getTime() - right.changedAt.getTime())
          .map(({ historyId, fromStatus, toStatus, changedAt }) => ({
            historyId,
            fromStatus,
            toStatus,
            changedAt,
          })),
      };
    });
  }

  async getAllRequestsForAdmin(user: CurrentUserData): Promise<(RequestEntity & { ownerDisplayName: string | null })[]> {
    if (user.role !== 'Admin') {
      throw new ForbiddenException('Only Admins can view requests across all departments.');
    }
    const requests = await this.requestsRepository.find({
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
    });
    const ownerIds = [...new Set(requests.map((request) => request.ownerId).filter((ownerId): ownerId is string => Boolean(ownerId)))];
    const owners = ownerIds.length > 0
      ? await this.usersRepository.find({
        where: { id: In(ownerIds) },
        select: { id: true, displayName: true, email: true },
      })
      : [];
    const ownerNames = new Map(owners.map((owner) => [owner.id, owner.displayName || owner.email || owner.id]));
    return requests.map((request) => Object.assign(request, {
      ownerDisplayName: request.ownerId ? ownerNames.get(request.ownerId) || request.ownerId : null,
    }));
  }

  async getDepartmentQueue(user: CurrentUserData): Promise<RequestEntity[]> {
    if (user.role !== 'Staff') {
      throw new ForbiddenException('Only department staff can view the department queue.');
    }
    if (!user.departmentId) {
      throw new ForbiddenException('Staff account has no assigned department.');
    }
    return this.requestsRepository.find({
      where: {
        departmentId: user.departmentId,
        status: In([RequestStatus.OPEN, RequestStatus.IN_PROGRESS]),
      },
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
    });
  }

  async getAssignableStaff(user: CurrentUserData, id: string): Promise<Pick<UserEntity, 'id' | 'displayName' | 'email'>[]> {
    if (user.role !== 'Admin') {
      throw new ForbiddenException('Only Admins can view staff available for assignment.');
    }
    const request = await this.requestsRepository.findOneBy({ id });
    if (!request) throw new NotFoundException(`Request with ID ${id} not found.`);
    if (request.status === RequestStatus.RESOLVED) {
      throw new BadRequestException('Resolved requests cannot be assigned.');
    }

    return this.usersRepository.find({
      where: { role: 'Staff', departmentId: request.departmentId },
      select: { id: true, displayName: true, email: true },
      order: { displayName: 'ASC', email: 'ASC' },
    });
  }

  async assign(user: CurrentUserData, id: string, dto: AssignRequestDto): Promise<RequestEntity> {
    const request = await this.findOne(user, id);
    if (user.role === 'Admin') {
      return this.assignForAdmin(request, id, dto.ownerId, user.id);
    }
    if (user.role !== 'Staff') {
      throw new ForbiddenException('Only department staff can take ownership in this slice.');
    }
    if (request.departmentId !== user.departmentId) {
      throw new ForbiddenException('Staff can act only on requests in their own department.');
    }
    if (dto.ownerId !== user.id) {
      throw new ForbiddenException('Staff can take ownership only for themselves.');
    }
    if (request.status !== RequestStatus.OPEN) {
      throw new BadRequestException(`A request can only be assigned while its status is '${RequestStatus.OPEN}'.`);
    }

    this.stateMachineService.validateTransition(request.status, RequestStatus.IN_PROGRESS);
    const claimedAt = new Date(Math.max(Date.now(), request.updatedAt.getTime() + 1));
    return this.updateWithStatusHistory(
      {
        id,
        departmentId: user.departmentId,
        status: RequestStatus.OPEN,
        ownerId: IsNull(),
      },
      { ownerId: user.id, status: RequestStatus.IN_PROGRESS, updatedAt: claimedAt },
      id,
      request.status,
      RequestStatus.IN_PROGRESS,
      user.id,
      claimedAt,
      'This request was already taken or changed. Refresh the department queue.',
    );
  }

  async reassignDepartment(user: CurrentUserData, id: string, dto: ReassignRequestDepartmentDto): Promise<RequestEntity> {
    if (user.role !== 'Admin') {
      throw new ForbiddenException('Only Admins can reassign a request to another department.');
    }
    const request = await this.requestsRepository.findOneBy({ id });
    if (!request) throw new NotFoundException(`Request with ID ${id} not found.`);
    if (request.status === RequestStatus.RESOLVED) {
      throw new BadRequestException('Resolved requests cannot be moved to another department.');
    }
    if (request.departmentId === dto.departmentId) {
      throw new BadRequestException('Choose a different department for reassignment.');
    }

    const criteria = {
      id,
      departmentId: request.departmentId,
      status: request.status,
      ownerId: request.ownerId ?? IsNull(),
    };
    const update = { departmentId: dto.departmentId, ownerId: null, status: RequestStatus.OPEN };
    if (request.status !== RequestStatus.OPEN) {
      const changedAt = new Date(Math.max(Date.now(), request.updatedAt.getTime() + 1));
      return this.updateWithStatusHistory(
        criteria,
        update,
        id,
        request.status,
        RequestStatus.OPEN,
        user.id,
        changedAt,
        'This request changed while it was being moved. Reload it and try again.',
      );
    }
    const result = await this.requestsRepository.update(criteria, update);
    if (result.affected !== 1) {
      throw new ConflictException('This request changed while it was being moved. Reload it and try again.');
    }
    return this.requestsRepository.findOneByOrFail({ id });
  }

  private async assignForAdmin(request: RequestEntity, id: string, ownerId: string, adminId: string): Promise<RequestEntity> {
    if (request.status === RequestStatus.RESOLVED) {
      throw new BadRequestException('Resolved requests cannot be assigned.');
    }
    const assignee = await this.usersRepository.findOneBy({
      id: ownerId,
      role: 'Staff',
      departmentId: request.departmentId,
    });
    if (!assignee) {
      throw new BadRequestException('Choose a Staff member assigned to the request department.');
    }

    if (request.status === RequestStatus.OPEN) {
      this.stateMachineService.validateTransition(request.status, RequestStatus.IN_PROGRESS);
    }
    const criteria = {
      id,
      departmentId: request.departmentId,
      status: request.status,
      ownerId: request.ownerId ?? IsNull(),
    };
    const update = {
      ownerId,
      ...(request.status === RequestStatus.OPEN ? { status: RequestStatus.IN_PROGRESS } : {}),
    };
    if (request.status === RequestStatus.OPEN) {
      const changedAt = new Date(Math.max(Date.now(), request.updatedAt.getTime() + 1));
      return this.updateWithStatusHistory(
        criteria,
        update,
        id,
        RequestStatus.OPEN,
        RequestStatus.IN_PROGRESS,
        adminId,
        changedAt,
        'This request was changed by another user. Reload it before assigning staff.',
      );
    }
    const result = await this.requestsRepository.update(criteria, update);
    if (result.affected !== 1) {
      throw new ConflictException('This request was changed by another user. Reload it before assigning staff.');
    }
    return this.requestsRepository.findOneByOrFail({ id });
  }

  async transitionStatus(user: CurrentUserData, id: string, dto: UpdateStatusDto): Promise<RequestEntity> {
    const request = await this.findOne(user, id);
    if (user.role !== 'Staff') {
      throw new ForbiddenException('Only department staff can update request status.');
    }
    if (request.departmentId !== user.departmentId) {
      throw new ForbiddenException('Staff can update only requests in their own department.');
    }
    if (dto.targetStatus !== RequestStatus.RESOLVED) {
      throw new BadRequestException(
        'Use PATCH /requests/:id/assign to start work. This endpoint only resolves an in-progress request.',
      );
    }

    this.stateMachineService.validateTransition(request.status, dto.targetStatus);
    const changedAt = new Date(Math.max(Date.now(), request.updatedAt.getTime() + 1));
    return this.updateWithStatusHistory(
      {
        id,
        departmentId: user.departmentId,
        status: RequestStatus.IN_PROGRESS,
      },
      { status: RequestStatus.RESOLVED },
      id,
      RequestStatus.IN_PROGRESS,
      RequestStatus.RESOLVED,
      user.id,
      changedAt,
      'This request was changed by another staff member. Refresh the department queue.',
    );
  }

  private async updateWithStatusHistory(
    criteria: RequestUpdateCriteria,
    update: RequestUpdateValues,
    requestId: string,
    fromStatus: RequestStatus,
    toStatus: RequestStatus,
    changedByUserId: string,
    changedAt: Date,
    conflictMessage: string,
  ): Promise<RequestEntity> {
    const result = await this.requestsRepository.update(criteria, { ...update, updatedAt: changedAt });
    if (result.affected !== 1) throw new ConflictException(conflictMessage);

    await this.statusHistoryRepository.save(this.statusHistoryRepository.create({
      requestId,
      fromStatus,
      toStatus,
      changedByUserId,
      changedAt,
    }));
    return this.requestsRepository.findOneByOrFail({ id: requestId });
  }

  private assertCanAccess(user: CurrentUserData, request: RequestEntity): void {
    if (user.role === 'Admin') return;
    if (user.role === 'Employee' && request.requesterId === user.id) return;
    if (user.role === 'Staff' && request.departmentId === user.departmentId) return;
    throw new ForbiddenException('You are not authorized to access this request.');
  }
}
