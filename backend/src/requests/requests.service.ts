import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUserData } from './current-user';
import { AssignRequestDto } from './dto/assign-request.dto';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { RequestEntity } from './entities/request.entity';
import { RequestStatus } from './enums/request-status.enum';
import { RequestStateMachineService } from './request-state-machine.service';

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(RequestEntity)
    private readonly requestsRepository: Repository<RequestEntity>,
    private readonly stateMachineService: RequestStateMachineService,
  ) {}

  async create(user: CurrentUserData, dto: CreateRequestDto): Promise<RequestEntity> {
    if (user.role !== 'Employee') {
      throw new ForbiddenException('Only employees can submit a new request in this slice.');
    }

    const request = this.requestsRepository.create({
      departmentId: dto.departmentId,
      requesterId: user.id,
      description: dto.description,
      status: RequestStatus.OPEN,
      ownerId: null,
    });
    return this.requestsRepository.save(request);
  }

  async findOne(user: CurrentUserData, id: string): Promise<RequestEntity> {
    const request = await this.requestsRepository.findOneBy({ id });
    if (!request) throw new NotFoundException(`Request with ID ${id} not found.`);
    this.assertCanAccess(user, request);
    return request;
  }

  async assign(user: CurrentUserData, id: string, dto: AssignRequestDto): Promise<RequestEntity> {
    const request = await this.findOne(user, id);
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
    request.ownerId = dto.ownerId;
    request.status = RequestStatus.IN_PROGRESS;
    return this.requestsRepository.save(request);
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
    request.status = dto.targetStatus;
    return this.requestsRepository.save(request);
  }

  private assertCanAccess(user: CurrentUserData, request: RequestEntity): void {
    if (user.role === 'Admin') return;
    if (user.role === 'Employee' && request.requesterId === user.id) return;
    if (user.role === 'Staff' && request.departmentId === user.departmentId) return;
    throw new ForbiddenException('You are not authorized to access this request.');
  }
}
