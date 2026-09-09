import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { RequestEntity } from './entities/request.entity';
import { RequestStatus } from './enums/request-status.enum';
import { CreateRequestDto } from './dto/create-request.dto';
import { AssignRequestDto } from './dto/assign-request.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { RequestStateMachineService } from './request-state-machine.service';

@Injectable()
export class RequestsService {
  private requests: Map<string, RequestEntity> = new Map();

  constructor(private readonly stateMachineService: RequestStateMachineService) {}

  create(dto: CreateRequestDto): RequestEntity {
    const newRequest: RequestEntity = {
      id: `REQ-${Date.now()}`,
      departmentId: dto.departmentId,
      requesterId: dto.requesterId,
      description: dto.description,
      status: RequestStatus.OPEN,
      ownerId: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.requests.set(newRequest.id, newRequest);
    return newRequest;
  }

  findOne(id: string): RequestEntity {
    const request = this.requests.get(id);
    if (!request) {
      throw new NotFoundException(`Request with ID ${id} not found.`);
    }
    return request;
  }

  assign(id: string, dto: AssignRequestDto): RequestEntity {
    const request = this.findOne(id);

    // Assignment is the lifecycle action that moves an Open request to In Progress.
    // The transition must go through the same state-machine rule as all other status changes.
    if (request.status === RequestStatus.OPEN) {
      this.stateMachineService.validateTransition(
        request.status,
        RequestStatus.IN_PROGRESS,
      );
      request.ownerId = dto.ownerId;
      request.status = RequestStatus.IN_PROGRESS;
    } else {
      // Do not silently change ownership on In Progress/Resolved requests in this bounded slice.
      throw new BadRequestException(
        `A request can only be assigned while its status is '${RequestStatus.OPEN}'.`,
      );
    }

    request.updatedAt = new Date();
    return request;
  }

  transitionStatus(id: string, dto: UpdateStatusDto): RequestEntity {
    const request = this.findOne(id);
    this.stateMachineService.validateTransition(request.status, dto.targetStatus);
    request.status = dto.targetStatus;
    request.updatedAt = new Date();
    return request;
  }
}
