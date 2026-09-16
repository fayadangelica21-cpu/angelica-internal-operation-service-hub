import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateRequestDto {
  @Transform(trim)
  @IsString()
  @IsIn(['DEPT-IT', 'DEPT-HR', 'DEPT-FINANCE'])
  departmentId: string;

  @Transform(trim)
  @IsNotEmpty({ message: 'Description is required.' })
  @IsString()
  @MaxLength(1000)
  description: string;
}
