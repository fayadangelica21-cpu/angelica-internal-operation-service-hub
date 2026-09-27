import { Transform } from 'class-transformer';
import { IsIn, IsString } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ReassignRequestDepartmentDto {
  @Transform(trim)
  @IsString()
  @IsIn(['DEPT-IT', 'DEPT-HR', 'DEPT-FINANCE'])
  departmentId: string;
}
