import { BadGatewayException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { TriageProviderService } from './triage-provider.service';
import { TriageAiRequest, TriageAiResponseDto } from './triage.dto';

describe('TriageProviderService — AI eval cases', () => {
  const originalEnv = { ...process.env };
  const basePayload: TriageAiRequest = {
    description: '',
    selectedDepartmentId: null,
    allowedDepartments: ['DEPT-IT', 'DEPT-HR', 'DEPT-FINANCE'],
    productContext: 'Internal operations support triage context.',
    outputContract: 'Return strict JSON only.',
  };

  let service: TriageProviderService;

  beforeEach(() => {
    delete process.env.AI_BASE_URL;
    delete process.env.AI_API_KEY;
    service = new TriageProviderService();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('clear input resolves to a confident, single-department suggestion', async () => {
    const result = await service.getSuggestion({
      ...basePayload,
      description: 'My laptop screen flickers and the battery drains quickly',
    });

    expect(result.classification).toBe('clear');
    expect(result.departmentId).toBe('DEPT-IT');
    expect(result.issueType).toBe('hardware');
    expect(result.requiresMoreInfo).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('thin input is flagged as needing more info', async () => {
    const result = await service.getSuggestion({
      ...basePayload,
      description: 'Broken',
    });

    expect(result.classification).toBe('thin');
    expect(result.requiresMoreInfo).toBe(true);
  });

  it('ambiguous input is not marked clear', async () => {
    const result = await service.getSuggestion({
      ...basePayload,
      description: 'Something is wrong with the thing from yesterday and it needs to be looked at soon',
    });

    expect(result.classification).toBe('ambiguous');
    expect(result.departmentId).toBeNull();
    expect(result.requiresMoreInfo).toBe(true);
  });

  it('unrelated input is not routed to any department', async () => {
    const result = await service.getSuggestion({
      ...basePayload,
      description: 'What is the weather forecast for this weekend and what is the football score?',
    });

    expect(result.classification).toBe('unrelated');
    expect(result.departmentId).toBeNull();
    expect(result.requiresMoreInfo).toBe(true);
  });

  it('only sends the bounded, business-approved fields to the AI provider', async () => {
    process.env.AI_BASE_URL = 'https://api.example-ai.test';
    process.env.AI_API_KEY = 'test-key';
    service = new TriageProviderService();

    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(validAiResponse()) } }],
      }),
    } as Response);

    await service.getSuggestion({
      description: 'Laptop screen flickers',
      selectedDepartmentId: 'DEPT-IT',
      allowedDepartments: ['DEPT-IT', 'DEPT-HR', 'DEPT-FINANCE'],
      productContext: 'Internal operations support triage context.',
      outputContract: 'Return strict JSON only.',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchSpy.mock.calls[0];
    const rawBody = (requestInit as RequestInit).body as string;
    const sentPayload = JSON.parse(rawBody);

    expect(sentPayload.messages[0].role).toBe('system');
    expect(sentPayload.messages[1].role).toBe('user');

    const sentContent = JSON.parse(sentPayload.messages[1].content);

    expect(Object.keys(sentContent).sort()).toEqual([
      'allowedDepartments',
      'description',
      'outputContract',
      'productContext',
      'selectedDepartmentId',
    ].sort());

    expect(sentContent).not.toHaveProperty('requesterId');
    expect(sentContent).not.toHaveProperty('status');
    expect(sentContent).not.toHaveProperty('ownerId');
    expect(sentContent).not.toHaveProperty('createdAt');
  });

  it('ignores a model-supplied draftId and generates a backend-owned one', async () => {
    process.env.AI_BASE_URL = 'https://api.example-ai.test';
    process.env.AI_API_KEY = 'test-key';
    service = new TriageProviderService();

    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          draftId: 'model-supplied-draft-id',
          departmentId: 'DEPT-IT',
          issueType: 'hardware',
          suggestedNextStep: 'Check the hardware details.',
          confidence: 0.9,
          requiresMoreInfo: false,
          classification: 'clear',
          reasoning: 'Looks clear.',
        }) } }],
      }),
    } as Response);

    const result = await service.getSuggestion({ ...basePayload, description: 'Laptop screen flickers' });

    expect(result.draftId).toMatch(/^triage_[A-Za-z0-9-]+$/);
    expect(result.draftId).not.toBe('model-supplied-draft-id');
  });

  it('answers thin input locally without calling the provider', async () => {
    process.env.AI_BASE_URL = 'https://api.example-ai.test';
    process.env.AI_API_KEY = 'test-key';
    service = new TriageProviderService();

    const fetchSpy = jest.spyOn(global, 'fetch' as any);

    const result = await service.getSuggestion({ ...basePayload, description: 'Broken' });

    expect(result.classification).toBe('thin');
    expect(result.requiresMoreInfo).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an invalid AI response with a 502 bad-gateway error', async () => {
    process.env.AI_BASE_URL = 'https://api.example-ai.test';
    process.env.AI_API_KEY = 'test-key';
    service = new TriageProviderService();

    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          ...validAiResponse(),
          urgencyLevel: 'high',
        }) } }],
      }),
    } as Response);

    await expect(
      service.getSuggestion({ ...basePayload, description: 'Laptop screen flickers' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('rejects a department/issue mismatch such as hardware routed to HR', async () => {
    process.env.AI_BASE_URL = 'https://api.example-ai.test';
    process.env.AI_API_KEY = 'test-key';
    service = new TriageProviderService();

    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          ...validAiResponse(),
          departmentId: 'DEPT-HR',
          issueType: 'hardware',
        }) } }],
      }),
    } as Response);

    await expect(
      service.getSuggestion({ ...basePayload, description: 'Laptop screen flickers' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('downgrades low-confidence clear findings to ambiguous', async () => {
    process.env.AI_BASE_URL = 'https://api.example-ai.test';
    process.env.AI_API_KEY = 'test-key';
    service = new TriageProviderService();

    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          ...validAiResponse(),
          confidence: 0.69,
          classification: 'clear',
        }) } }],
      }),
    } as Response);

    const result = await service.getSuggestion({ ...basePayload, description: 'Laptop screen flickers' });

    expect(result.classification).toBe('ambiguous');
    expect(result.requiresMoreInfo).toBe(true);
  });

  it('rejects an AI response with an invalid issueType as a bad provider response', async () => {
    process.env.AI_BASE_URL = 'https://api.example-ai.test';
    process.env.AI_API_KEY = 'test-key';
    service = new TriageProviderService();

    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          ...validAiResponse(),
          issueType: 'urgent',
        }) } }],
      }),
    } as Response);

    await expect(
      service.getSuggestion({ ...basePayload, description: 'Laptop screen flickers' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('surfaces a service unavailable error when the provider fails', async () => {
    process.env.AI_BASE_URL = 'https://api.example-ai.test';
    process.env.AI_API_KEY = 'test-key';
    service = new TriageProviderService();

    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({})
    } as Response);

    await expect(
      service.getSuggestion({ ...basePayload, description: 'Laptop screen flickers' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  function validAiResponse(): TriageAiResponseDto {
    return {
      draftId: 'triage_test_1',
      departmentId: 'DEPT-IT',
      issueType: 'hardware',
      suggestedNextStep: 'Confirm the hardware issue details.',
      confidence: 0.9,
      requiresMoreInfo: false,
      classification: 'clear',
      reasoning: 'Matches a known hardware pattern.',
    };
  }
});
