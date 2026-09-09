import { IsNotEmpty, IsString } from 'class-validator';

export class AssignRequestDto {
  @IsNotEmpty()
  @IsString()
  ownerId: string;
}
