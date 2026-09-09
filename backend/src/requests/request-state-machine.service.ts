import { Injectable, BadRequestException } from '@nestjs/common';
import { RequestStatus } from './enums/request-status.enum';

@Injectable()
export class RequestStateMachineService {
  // Enforces the two valid half-step transitions only.
  private readonly allowedTransitions: Record<RequestStatus, RequestStatus[]> = {
    [RequestStatus.OPEN]: [RequestStatus.IN_PROGRESS],
    [RequestStatus.IN_PROGRESS]: [RequestStatus.RESOLVED],
    [RequestStatus.RESOLVED]: [],
  };

  validateTransition(currentStatus: RequestStatus, nextStatus: RequestStatus): void {
    const validNextStates = this.allowedTransitions[currentStatus];

    if (!validNextStates || !validNextStates.includes(nextStatus)) {
      throw new BadRequestException(
        `Invalid status transition from '${currentStatus}' to '${nextStatus}'. Direct jumps and reverse transitions are strictly forbidden.`,
      );
    }
  }
}
