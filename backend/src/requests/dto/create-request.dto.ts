import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

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

  @IsNotEmpty({ message: 'Expected resolution date and time are required.' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, {
    message: 'Expected resolution must include a valid date and time in ISO format.',
  })
  @IsDateString({ strict: true }, { message: 'Expected resolution must be a valid date and time.' })
  expectedResolutionDate?: string;
}
