import { BadRequestException } from '@nestjs/common';
import { RequestStateMachineService } from './request-state-machine.service';
import { RequestStatus } from './enums/request-status.enum';

describe('RequestStateMachineService', () => {
  const service = new RequestStateMachineService();

  it('allows the business lifecycle Open -> In Progress -> Resolved', () => {
    expect(() => service.validateTransition(RequestStatus.OPEN, RequestStatus.IN_PROGRESS)).not.toThrow();
    expect(() => service.validateTransition(RequestStatus.IN_PROGRESS, RequestStatus.RESOLVED)).not.toThrow();
  });

  it('regression protection: continues to reject the previously forbidden Open -> Resolved jump', () => {
    expect(() => service.validateTransition(RequestStatus.OPEN, RequestStatus.RESOLVED))
      .toThrow(BadRequestException);
  });

  it('treats Resolved as terminal', () => {
    expect(() => service.validateTransition(RequestStatus.RESOLVED, RequestStatus.IN_PROGRESS))
      .toThrow(BadRequestException);
    expect(() => service.validateTransition(RequestStatus.RESOLVED, RequestStatus.OPEN))
      .toThrow(BadRequestException);
  });
});
