import { IsEnum, IsNotEmpty } from 'class-validator';
import { RequestStatus } from '../enums/request-status.enum';

export class UpdateStatusDto {
  @IsNotEmpty()
  @IsEnum(RequestStatus, {
    message: 'Status must be one of the exact spec values: Open, In Progress, Resolved',
  })
  targetStatus: RequestStatus;
}
