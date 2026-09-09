import { RequestStatus } from '../enums/request-status.enum';

export class RequestEntity {
  id: string;
  departmentId: string;
  requesterId: string;
  description: string;
  status: RequestStatus;
  ownerId?: string;
  createdAt: Date;
  updatedAt: Date;
}
