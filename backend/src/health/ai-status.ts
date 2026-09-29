/**
 * Remembers the outcome of the most recent REAL triage call, so /health/ready can report
 * the triage model state without calling the provider on every poll.
 *  fallback    : no provider configured (by design)
 *  unknown     : configured, but no recent call to judge by
 *  ok          : last call succeeded
 *  unavailable : last call failed recently (within the TTL)
 */
export type TriageModelState = 'ok' | 'unavailable' | 'fallback' | 'unknown';

let lastOk = 0;
let lastFail = 0;
let lastReason: string | null = null;

const ttlMs = () => Number(process.env.AI_STATUS_TTL_MS || 10 * 60 * 1000);

export const aiStatus = {
  recordSuccess(): void {
    lastOk = Date.now();
  },
  recordFailure(reason: string): void {
    lastFail = Date.now();
    lastReason = reason;
  },
  reset(): void {
    lastOk = 0;
    lastFail = 0;
    lastReason = null;
  },
  state(now = Date.now()): TriageModelState {
    if (!process.env.AI_BASE_URL || !process.env.AI_API_KEY) return 'fallback';
    if (lastFail > lastOk && now - lastFail <= ttlMs()) return 'unavailable';
    if (lastOk > 0 && lastOk >= lastFail) return 'ok';
    return 'unknown';
  },
  lastReason: () => lastReason,
};
