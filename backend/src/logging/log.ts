import { AsyncLocalStorage } from 'async_hooks';

/**
 * Structured JSON logging for the Operations Hub backend.
 * One JSON object per line on stdout, so the host (Render) can search it.
 *
 * Redaction is central and defensive:
 *  - keys that usually carry secrets or personal data are replaced entirely;
 *  - string values are scrubbed for bearer tokens, JWTs, credentialed URLs and key=value secrets.
 */
export type LogLevel = 'info' | 'warn' | 'error';

export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

const SENSITIVE_KEY =
  /pass(word|wd)?|token|secret|authorization|cookie|header|^body$|request[-_]?body|response([-_]?body)?|api[-_]?key|database[-_]?url|credential|private[-_]?key|description|prompt|content|email|display[-_]?name|phone|address|ssn|birth|^uid$|firebase[-_]?uid/i;

const REDACTED = '[REDACTED]';

export function getRelease(): string {
  return process.env.RENDER_GIT_COMMIT || process.env.RELEASE_SHA || 'dev';
}

export function scrubString(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, '[REDACTED_JWT]')
    .replace(/\b([a-z][a-z0-9+.-]*):\/\/[^\s/@:]+:[^\s/@]+@/gi, '$1://[REDACTED]@')
    .replace(/\b(api[-_]?key|token|secret|password|passwd)(\s*[=:]\s*)[^\s&"',;]+/gi, '$1$2[REDACTED]')
    .replace(/\b(sk|rqst|pk)[-_][A-Za-z0-9_-]{12,}/g, '[REDACTED_KEY]');
}

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return scrubString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth > 4) return '[TRUNCATED]';
  if (value instanceof Error) return { name: value.name, message: scrubString(value.message) };
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

type Writer = (line: string) => void;
let writer: Writer = (line) => process.stdout.write(line + '\n');

/** Test hook: capture log lines instead of writing to stdout. Pass null to restore. */
export function setLogWriter(fn: Writer | null): void {
  writer = fn ?? ((line) => process.stdout.write(line + '\n'));
}

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const requestId = requestContext.getStore()?.requestId;
  const entry = {
    time: new Date().toISOString(),
    level,
    event,
    ...(requestId ? { requestId } : {}),
    release: getRelease(),
    ...(redact(fields) as Record<string, unknown>),
  };
  writer(JSON.stringify(entry));
}

export const logger = {
  info: (event: string, fields?: Record<string, unknown>) => log('info', event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => log('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => log('error', event, fields),
};
