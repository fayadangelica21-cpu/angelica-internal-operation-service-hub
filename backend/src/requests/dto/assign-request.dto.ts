import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class AssignRequestDto {
  @IsNotEmpty()
  @IsString()
  @Length(1, 128)
  @Matches(/\S/, { message: 'ownerId cannot contain only whitespace.' })
  ownerId: string;
}
