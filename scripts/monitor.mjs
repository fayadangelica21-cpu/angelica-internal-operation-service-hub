// Health monitor: degraded x3 -> alert -> ok -> resolved -> ok ... (Node 18+, no dependencies)
const URL_ = process.env.MONITOR_URL ?? 'http://localhost:3001/health/ready';
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 10000);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 15000);
const ALERT_AFTER = Number(process.env.ALERT_AFTER ?? 3);
const MAX_CHECKS = Number(process.env.MAX_CHECKS ?? Infinity);

const log = (event, extra = {}) => console.log(JSON.stringify({ time: new Date().toISOString(), event, ...extra }));

let badCount = 0;
let alerting = false;
let incidentStart = null;
let release = null;

async function check() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL_, { signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    release = body.release ?? release;
    if (res.status === 200 && body.status === 'ok') return { ok: true };
    return { ok: false, status: res.status, reason: body.status ?? 'bad_response', triageModel: body.checks?.triageModel };
  } catch (e) {
    return { ok: false, status: 0, reason: e.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(t);
  }
}

function onBad(r) {
  badCount++;
  log('monitor.degraded', { count: badCount, of: ALERT_AFTER, status: r.status, reason: r.reason, triageModel: r.triageModel, release });
  if (badCount >= ALERT_AFTER && !alerting) {
    alerting = true;
    incidentStart = Date.now();
    log('monitor.alert', { consecutiveFailures: badCount, release });
  }
}

function onOk() {
  log('monitor.ok', { status: 200, release });
  if (alerting) {
    log('monitor.resolved', { downtimeMs: Date.now() - incidentStart, release });
    alerting = false;
    incidentStart = null;
  }
  badCount = 0;
}

log('monitor.started', { intervalMs: INTERVAL_MS, alertAfter: ALERT_AFTER });
for (let i = 0; i < MAX_CHECKS; i++) {
  const r = await check();
  r.ok ? onOk() : onBad(r);
  if (i < MAX_CHECKS - 1) await new Promise((res) => setTimeout(res, INTERVAL_MS));
}
