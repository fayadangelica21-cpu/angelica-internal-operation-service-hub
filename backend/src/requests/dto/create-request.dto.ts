import { IsNotEmpty, IsString } from 'class-validator';

export class CreateRequestDto {
  @IsNotEmpty()
  @IsString()
  departmentId: string;

  @IsNotEmpty()
  @IsString()
  requesterId: string;

  @IsNotEmpty()
  @IsString()
  description: string;
}
