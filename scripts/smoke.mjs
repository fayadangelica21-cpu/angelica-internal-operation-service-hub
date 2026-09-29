// Live smoke test (Node 18+, no dependencies). Runs against the DEPLOYED app, not localhost.
//
//   BASE_URL=https://<your-api>.onrender.com \
//   FIREBASE_API_KEY=<firebase web api key> \
//   SMOKE_EMPLOYEE_EMAIL=... SMOKE_EMPLOYEE_PASSWORD=... \
//   SMOKE_STAFF_EMAIL=...    SMOKE_STAFF_PASSWORD=...      (an IT staff account, DEPT-IT) \
//   [EXPECT_RELEASE=<git sha>] \
//   npm run verify:smoke
//
// Credentials are read from the environment and are never printed.
const API = (process.env.BASE_URL || '').replace(/\/$/, '');
const KEY = process.env.FIREBASE_API_KEY;
const need = ['BASE_URL', 'FIREBASE_API_KEY', 'SMOKE_EMPLOYEE_EMAIL', 'SMOKE_EMPLOYEE_PASSWORD', 'SMOKE_STAFF_EMAIL', 'SMOKE_STAFF_PASSWORD'];
const missing = need.filter((n) => !process.env[n]);
if (missing.length) {
  console.error('verify:smoke cannot start. Missing environment variables: ' + missing.join(', '));
  process.exit(2);
}

let failures = 0;
const step = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
};

async function call(method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90000), // a sleeping free-tier backend can take about a minute to wake
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function signIn(email, password) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.idToken) throw new Error(`sign-in failed for a demo account (HTTP ${res.status}); check the smoke credentials`);
  return json.idToken;
}

try {
  // 1. Health and exact release
  const health = await call('GET', '/health/ready');
  step('health/ready is 200 and status ok', health.status === 200 && health.json.status === 'ok', `status=${health.json.status}, triageModel=${health.json.checks?.triageModel}`);
  const expected = process.env.EXPECT_RELEASE;
  if (expected) step('deployed release matches the submitted SHA', String(health.json.release).startsWith(expected.slice(0, 7)), `release=${String(health.json.release).slice(0, 7)}`);

  // 2. No token => rejected
  step('request without a token is rejected (401)', (await call('GET', '/requests')).status === 401);

  const emp = await signIn(process.env.SMOKE_EMPLOYEE_EMAIL, process.env.SMOKE_EMPLOYEE_PASSWORD);
  const staff = await signIn(process.env.SMOKE_STAFF_EMAIL, process.env.SMOKE_STAFF_PASSWORD);
  const staffMe = await call('GET', '/auth/me', { token: staff });
  step('staff account resolves to role Staff in DEPT-IT', staffMe.json.role === 'Staff' && staffMe.json.departmentId === 'DEPT-IT', `role=${staffMe.json.role}, dept=${staffMe.json.departmentId}`);

  // 3. Employee: invalid input rejected, valid input accepted and persisted
  const invalid = await call('POST', '/requests', { token: emp, body: { departmentId: 'DEPT-IT', description: '', expectedResolutionDate: new Date(Date.now() + 864e5).toISOString() } });
  step('employee: empty description is rejected (400)', invalid.status === 400);

  const created = await call('POST', '/requests', {
    token: emp,
    body: { departmentId: 'DEPT-IT', description: 'SMOKE TEST: laptop screen flickers', expectedResolutionDate: new Date(Date.now() + 864e5).toISOString() },
  });
  const id = created.json.id;
  step('employee: creates a request (201)', created.status === 201 && !!id, `status=${created.status}`);
  if (!id) throw new Error('cannot continue without a created request');

  const read = await call('GET', `/requests/${id}`, { token: emp });
  step('employee: request is persisted with status Open', read.status === 200 && read.json.status === 'Open', `status=${read.json.status}`);

  // 4. Boundaries
  step('employee cannot change status (403)', (await call('PATCH', `/requests/${id}/status`, { token: emp, body: { targetStatus: 'Resolved' } })).status === 403);
  step('staff: cannot jump Open -> Resolved (400)', (await call('PATCH', `/requests/${id}/status`, { token: staff, body: { targetStatus: 'Resolved' } })).status === 400);

  // 5. Valid lifecycle
  const assigned = await call('PATCH', `/requests/${id}/assign`, { token: staff, body: { ownerId: staffMe.json.id } });
  step('staff: takes ownership -> In Progress (200)', assigned.status === 200 && assigned.json.status === 'In Progress', `status=${assigned.json.status}`);
  const resolved = await call('PATCH', `/requests/${id}/status`, { token: staff, body: { targetStatus: 'Resolved' } });
  step('staff: resolves the request (200)', resolved.status === 200 && resolved.json.status === 'Resolved', `status=${resolved.json.status}`);

  // 6. Updated state visible and persistent
  const final = await call('GET', `/requests/${id}`, { token: emp });
  step('employee sees the updated state (Resolved)', final.status === 200 && final.json.status === 'Resolved', `status=${final.json.status}`);
} catch (err) {
  // Request/network errors can embed URLs or credential-bearing configuration. Keep output generic.
  console.error('FAIL  smoke aborted by a request or network error; check service availability and configuration.');
  failures++;
}

console.log(failures ? `\nverify:smoke FAILED (${failures} problem${failures > 1 ? 's' : ''})` : '\nverify:smoke OK');
process.exit(failures ? 1 : 0);
