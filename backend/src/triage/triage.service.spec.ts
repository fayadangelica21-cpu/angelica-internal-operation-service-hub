import { ForbiddenException } from '@nestjs/common';
import { CurrentUserData } from '../requests/current-user';
import { TriageAiRequest, TriageAiResponseDto, TriageRequestDto } from './triage.dto';
import { TriageProviderService } from './triage-provider.service';
import { TriageService } from './triage.service';

describe('TriageService', () => {
  const employee: CurrentUserData = { id: 'EMP-001', role: 'Employee' };
  const staff: CurrentUserData = { id: 'STF-001', role: 'Staff', departmentId: 'DEPT-IT' };
  const admin: CurrentUserData = { id: 'ADM-001', role: 'Admin' };

  const fakeSuggestion: TriageAiResponseDto = {
    draftId: 'triage_test',
    departmentId: 'DEPT-IT',
    issueType: 'hardware',
    suggestedNextStep: 'Confirm the hardware issue details.',
    confidence: 0.9,
    requiresMoreInfo: false,
    classification: 'clear',
    reasoning: 'Matches a known hardware pattern.',
  };

  function makeService() {
    const providerService = {
      getSuggestion: jest.fn().mockResolvedValue(fakeSuggestion),
    } as unknown as TriageProviderService;

    return {
      service: new TriageService(providerService),
      providerService,
    };
  }

  it('allows an employee to request a triage suggestion', async () => {
    const { service } = makeService();
    const dto: TriageRequestDto = {
      description: 'Laptop screen flickers',
      selectedDepartmentId: 'DEPT-IT',
    };

    await expect(service.createTriage(employee, dto)).resolves.toEqual(fakeSuggestion);
  });

  it('rejects a staff identity from requesting a triage suggestion', async () => {
    const { service } = makeService();
    const dto: TriageRequestDto = {
      description: 'Laptop screen flickers',
      selectedDepartmentId: 'DEPT-IT',
    };

    await expect(service.createTriage(staff, dto)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an admin identity from requesting a triage suggestion', async () => {
    const { service } = makeService();
    const dto: TriageRequestDto = {
      description: 'Laptop screen flickers',
      selectedDepartmentId: 'DEPT-IT',
    };

    await expect(service.createTriage(admin, dto)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('never forwards anything beyond the five business-approved fields to the provider', async () => {
    const { service, providerService } = makeService();
    const dto: TriageRequestDto = {
      description: 'Laptop screen flickers',
      selectedDepartmentId: 'DEPT-IT',
    };

    await service.createTriage(employee, dto);

    expect(providerService.getSuggestion).toHaveBeenCalledTimes(1);
    const sentPayload = (providerService.getSuggestion as jest.Mock).mock.calls[0][0] as TriageAiRequest;

    expect(Object.keys(sentPayload).sort()).toEqual([
      'allowedDepartments',
      'description',
      'outputContract',
      'productContext',
      'selectedDepartmentId',
    ].sort());

    expect(sentPayload.allowedDepartments).toEqual(['DEPT-IT', 'DEPT-HR', 'DEPT-FINANCE']);
    expect(sentPayload.description).toBe(dto.description);
    expect(sentPayload.selectedDepartmentId).toBe(dto.selectedDepartmentId);
  });

  it('defaults selectedDepartmentId to null when the employee has not chosen one yet', async () => {
    const { service, providerService } = makeService();
    const dto: TriageRequestDto = { description: 'Something is broken' };

    await service.createTriage(employee, dto);

    const sentPayload = (providerService.getSuggestion as jest.Mock).mock.calls[0][0] as TriageAiRequest;
    expect(sentPayload.selectedDepartmentId).toBeNull();
  });
});
