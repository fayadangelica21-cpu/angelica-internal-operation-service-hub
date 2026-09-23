import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const ALLOWED_DEPARTMENTS = ['DEPT-IT', 'DEPT-HR', 'DEPT-FINANCE'] as const;
export type AllowedDepartmentId = (typeof ALLOWED_DEPARTMENTS)[number];

export const ALLOWED_ISSUE_TYPES = [
  'hardware',
  'software',
  'access',
  'hr_policy',
  'payroll',
  'finance',
  'general',
] as const;
export type IssueType = (typeof ALLOWED_ISSUE_TYPES)[number];

export const ALLOWED_CLASSIFICATIONS = ['clear', 'thin', 'ambiguous', 'unrelated'] as const;
export type TriageClassification = (typeof ALLOWED_CLASSIFICATIONS)[number];

export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class TriageRequestDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Description is required.' })
  @MaxLength(2000)
  description: string;

  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsIn(ALLOWED_DEPARTMENTS)
  selectedDepartmentId?: AllowedDepartmentId | null;
}

export class TriageAiRequest {
  description: string;
  selectedDepartmentId?: AllowedDepartmentId | null;
  allowedDepartments: AllowedDepartmentId[];
  productContext: string;
  outputContract: string;
}

export class TriageAiResponseDto {
  draftId: string;
  departmentId?: AllowedDepartmentId | null;
  issueType: IssueType;
  suggestedNextStep: string;
  confidence: number;
  reasoning: string;
  classification: TriageClassification;
  requiresMoreInfo: boolean;
}
