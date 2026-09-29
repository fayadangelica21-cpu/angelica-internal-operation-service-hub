import { logger, redact, scrubString, setLogWriter } from './log';

describe('structured logging redaction', () => {
  const lines: string[] = [];
  beforeEach(() => {
    lines.length = 0;
    setLogWriter((l) => lines.push(l));
  });
  afterAll(() => setLogWriter(null));

  it('never writes secrets, tokens, credentials or free text, even when passed by mistake', () => {
    const fakeJwt = 'eyJhbGciOiJSUzI1NiJ9.eyJ1aWQiOiJhYmMxMjMifQ.c2lnbmF0dXJlc2lnbmF0dXJl';
    const fakeKey = 'sk-fakefixture1';
    logger.error('test.event', {
      authorization: `Bearer ${fakeJwt}`,
      apiKey: fakeKey,
      DATABASE_URL: 'postgresql://admin:SuperSecretPw@db.example.com/hub',
      description: 'My salary is 5000 and my password is hunter2',
      email: 'someone@example.com',
      nested: { password: 'x', note: `token=${fakeKey} and Bearer ${fakeJwt}` },
      errMessage: 'connect failed postgresql://admin:SuperSecretPw@db.example.com/hub',
    });
    const out = lines.join('\n');
    for (const secret of [fakeJwt, fakeKey, 'SuperSecretPw', 'hunter2', 'someone@example.com', 'salary is 5000']) {
      expect(out).not.toContain(secret);
    }
  });

  it('keeps the useful operational fields', () => {
    logger.warn('ai.triage.failed', { reason: 'provider_timeout', httpStatus: 503, durationMs: 15002 });
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({ level: 'warn', event: 'ai.triage.failed', reason: 'provider_timeout', httpStatus: 503, durationMs: 15002 });
    expect(entry.time).toBeDefined();
    expect(entry.release).toBeDefined();
  });

  it('scrubs credentialed URLs and bearer tokens inside plain strings', () => {
    expect(scrubString('postgres://u:p4ss@host/db')).toBe('postgres://[REDACTED]@host/db');
    expect(scrubString('Authorization: Bearer abc.def.ghi')).not.toContain('abc.def.ghi');
    expect(redact({ id: 'DEPT-IT', count: 3 })).toEqual({ id: 'DEPT-IT', count: 3 });
  });
});
