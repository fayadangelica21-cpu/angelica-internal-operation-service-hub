import { TriageProviderService } from './triage-provider.service';
import { aiStatus } from '../health/ai-status';
import { setLogWriter } from '../logging/log';

describe('triage failure is explained in logs without leaking data', () => {
  const lines: string[] = [];
  const env = { ...process.env };
  const realFetch = global.fetch;
  const description = 'My laptop screen is broken and my password is hunter2, employee id 998877';

  beforeEach(() => {
    lines.length = 0;
    setLogWriter((l) => lines.push(l));
    aiStatus.reset();
    process.env.AI_BASE_URL = 'https://provider.example/v1';
    process.env.AI_API_KEY = 'sk-fakefixture1';
  });
  afterEach(() => {
    global.fetch = realFetch;
    process.env = { ...env };
    setLogWriter(null);
  });

  const input = () => ({ description, allowedDepartments: [], productContext: '', outputContract: '' }) as never;

  it('provider 5xx: throws 503, logs reason, marks the triage model unavailable', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as never;
    await expect(new TriageProviderService().getSuggestion(input())).rejects.toMatchObject({ status: 503 });

    const entry = JSON.parse(lines.find((l) => l.includes('ai.triage.failed'))!);
    expect(entry).toMatchObject({ level: 'error', event: 'ai.triage.failed', reason: 'provider_5xx', httpStatus: 503 });
    expect(aiStatus.state()).toBe('unavailable');

    const out = lines.join('\n');
    for (const leaked of ['hunter2', '998877', 'laptop screen', 'sk-FAKEFAKE', 'Bearer']) expect(out).not.toContain(leaked);
  });

  it('network failure: logs provider_unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed')) as never;
    await expect(new TriageProviderService().getSuggestion(input())).rejects.toBeDefined();
    expect(lines.join('\n')).toContain('provider_unreachable');
  });
});
