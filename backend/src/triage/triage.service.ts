import { ForbiddenException, Injectable } from '@nestjs/common';
import { CurrentUserData } from '../requests/current-user';
import { TriageAiRequest, TriageAiResponseDto, TriageRequestDto } from './triage.dto';
import { TriageProviderService } from './triage-provider.service';

@Injectable()
export class TriageService {
  constructor(private readonly providerService: TriageProviderService) {}

  async createTriage(user: CurrentUserData, request: TriageRequestDto): Promise<TriageAiResponseDto> {
    if (user.role !== 'Employee') {
      throw new ForbiddenException('Only employees can request an AI triage suggestion in this slice.');
    }

    const payload: TriageAiRequest = {
      description: request.description,
      selectedDepartmentId: request.selectedDepartmentId ?? null,
      allowedDepartments: ['DEPT-IT', 'DEPT-HR', 'DEPT-FINANCE'],
      productContext:
        'This is an internal operations support system for IT, HR, and Finance requests. The AI assists with triage by suggesting the most likely department and next step before the employee submits the final request.',
      outputContract:
        'Return strict JSON only. Keys must be: draftId, departmentId, issueType, suggestedNextStep, confidence, requiresMoreInfo, classification, reasoning. Allowed values are fixed and must match the backend enums exactly.',
    };

    return this.providerService.getSuggestion(payload);
  }
}
