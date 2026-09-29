# Week 5: Release Operations

This runbook is the operational handoff for an engineer, operator, and stranger user. It records how to identify, check, intentionally fail, and recover the live Operations Hub. It must contain observed evidence, not planned steps presented as completed.

## Slide hard-fail gate: current evidence disposition

A missing or failing item below means NO-GO. Do not claim a pass from source code or local tests where the slide requires live proof.

| Hard-fail condition | Evidence required to pass | Current disposition |
|---|---|---|
| Repository inaccessible, submitted SHA unknown, or deployed SHA mismatch | Public repository URL, frozen submitted SHA, and the same SHA from `/health/ready` | Pending publication and freeze |
| No reachable remote app or grader cannot enter/use it | Live frontend URL and private-window journey using the demo roles | Pending live verification |
| Core journey, persistence, authorization, validation, or Week 4 behavior broken | UI journey evidence showing create, allowed work, rejected boundary, persisted state, and manual intake when AI fails | Local automated coverage exists; live journey pending |
| Required checks red/missing or real secret committed | Green CI on final SHA and clean secret scan; confirm no current secret in tracked files | Local release gate passed; final SHA CI pending |
| Health/operations evidence missing or no real recovery | Captured health/log/monitor signals and a completed failure, recovery, and post-recovery critical-path check | Pending live drill evidence |
| Owner cannot defend the work | Owner's account of AI assistance, personal verification, decisions, and remaining risk | Owner statement pending |

**Current decision: NO-GO.** The live release, frozen SHA, external stranger checks, captured operational drills, final smoke, and ownership evidence have not been verified in this workspace. Change this only after the evidence above is recorded. No item in this table is implied complete by the local implementation.

## 1. Release identification

| Item | Value |
|---|---|
| Repository | `https://github.com/fayadangelica21-cpu/angelica-internal-operation-service-hub` |
| Submitted (frozen) SHA | `<FINAL_SHA>` **Evidence pending** |
| Frontend | `<FRONTEND_URL>` |
| API | `<API_URL>` |
| How to see the running release | `GET <API_URL>/health/ready` -> `release` (the deployed commit SHA, from `RENDER_GIT_COMMIT`). It must equal the submitted SHA. Every log line also carries `release`. |

## 2. Target and configuration

Render (static site + Node web service, free plan) with hosted Postgres on Neon. Reproducible from `render.yaml`. Secret values exist only in the host dashboard.

| Variable | Where | Purpose | Secret |
|---|---|---|---|
| `DATABASE_URL` | API | Postgres connection (required in production) | yes |
| `DB_SYNCHRONIZE` | API | `true` only for the first deploy on an empty database | no |
| `CORS_ORIGINS` | API | Browser origins allowed to call the API (frontend URL) | no |
| `FIREBASE_PROJECT_ID` | API | Token verification | no |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | API | Firebase Admin credential for ID-token verification | yes |
| `FIREBASE_ROLE_ASSIGNMENTS` | API | Server-owned roles keyed by Firebase UID | yes (UIDs) |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | API | Triage provider (both URL and key empty = deterministic fallback) | key: yes |
| `AI_STATUS_TTL_MS` | API | How long a failed triage call keeps health `degraded` (default 10 min) | no |
| `VITE_API_URL` | Frontend build | API address | no |
| `VITE_FIREBASE_*` | Frontend build | Public Firebase web configuration (defaults are currently in the client) | no |
| `BASE_URL` | Smoke command | Deployed API base URL for `npm run verify:smoke` | no |
| `FIREBASE_API_KEY`, `SMOKE_*` | Smoke command | Firebase REST sign-in and demo-account credentials; supply locally, never print | Firebase web key is public; demo passwords are private |

Startup validates the configuration and refuses to start with a message that names the variable, never its value (`config.invalid`).

## 3. Secret hygiene

An early commit (`3aa8acb`) contained a backend `.env` with an AI provider key. The file was removed in `8805d0d`. The exposed key has been revoked and replaced; record the revocation date before submission. The current key exists only in the hosting dashboard. `.env` is gitignored, `.gitleaksignore` records the old history findings, and `npm run verify:secrets` scans tracked and new non-ignored repository files for `.env` files and secret-looking values. Historical findings are allowlisted separately. The old AI provider key and two Firebase web API key detections are listed in `.gitleaksignore`; Firebase web keys are public client configuration, while access is enforced by Firebase Authorized domains and server-side ID-token verification. This dependency-free script does not scan Git history.

## 4. Health checks

| Endpoint | Meaning | Response |
|---|---|---|
| `GET /health/live` | The process is running. No database call. Used by Render's health check. | always `200` |
| `GET /health/ready` | Database answers `SELECT 1` and all registered entity tables exist (3 s overall timeout); includes triage-model state | `200 ok`, `200 degraded`, or `503 down` |

```json
{ "status": "ok|degraded|down", "release": "<sha>", "uptimeSec": 812,
  "checks": { "database": "ok|fail", "triageModel": "ok|unavailable|fallback|unknown" } }
```

| triageModel | Meaning | Overall status |
|---|---|---|
| `fallback` | No provider configured (by design) | ok |
| `unknown` | Provider configured, no recent call to judge by | ok |
| `ok` | The last real triage call succeeded | ok |
| `unavailable` | The last real triage call failed within the TTL | **degraded** |

The provider is not called on every poll (cost, latency); the state comes from real triage calls. After the cause is fixed, one successful triage call (or the TTL expiring) clears `degraded`. A reachable database with missing application tables gives `503 down`. This project uses TypeORM `synchronize` for initial schema creation and does not yet have migrations. Bodies contain no secrets or personal data, and the endpoints are public on purpose.

## 5. Logs

One JSON object per line on stdout: `time, level, event, release`, plus `requestId, method, route, status, durationMs, actorRole, departmentId` for requests.

| Event | Level | Meaning |
|---|---|---|
| `app.started` | info | Boot: port, release, database kind, triage mode |
| `config.invalid` | error | Startup refused; lists variable names only |
| `request.completed` | info/warn/error | One line per finished request (health polls with 200 are skipped) |
| `auth.rejected` | warn | 401 or 403: the boundary held |
| `validation.rejected` | warn | 400: invalid input or forbidden lifecycle jump |
| `lifecycle.transition` | info | Request moved from one status to another (correlation requestId and statuses only) |
| `ai.triage.failed` | error | Triage failed: `reason` = `provider_timeout`, `provider_5xx`, `invalid_response`, `provider_unreachable`; `httpStatus`, `durationMs`, `model` |
| `ai.fallback.used` | info | No provider configured, deterministic suggestion returned |
| `health.check` | info/warn/error | Logged only when the health status changes (`database`, `triageModel`, `errorCode`) |
| `seed.completed` / `seed.failed` | info/error | Seeding staff profiles on a new database |

**Redaction (central, in `backend/src/logging/log.ts`).** Never logged: passwords, tokens, `Authorization`/cookie headers, API keys, `DATABASE_URL`, the employee's request description, AI prompts and responses, emails, display names, Firebase UIDs. Keys with those names are replaced by `[REDACTED]`; string values are scrubbed for bearer tokens, JWTs, credentialed URLs and key-like strings. Database errors are logged as an error **code** only. Tests: `backend/src/logging/log.spec.ts`, `backend/src/health/health.spec.ts`, `backend/src/triage/triage-failure-logging.spec.ts`.

Example (explains a 503 from triage, as the slide asks: what, where, why):

```json
{"time":"...","level":"error","event":"ai.triage.failed","requestId":"<correlation-id>","release":"<sha>","reason":"provider_timeout","httpStatus":503,"durationMs":15002,"model":"openai/gpt-4o-mini","message":"Triage failed: the triage model could not be reached or returned an unusable answer."}
```

## 6. Monitoring

### Run the repository monitor against the deployed API

From the repository root in PowerShell, point the monitor at the live readiness URL. It defaults to a local URL if `MONITOR_URL` is omitted, so set this for a deployment. Defaults are a 10-second interval, 15-second request timeout, and an alert after 3 consecutive bad checks. Keep the terminal open during a drill; stop it with `Ctrl+C` when the observation is complete.

```powershell
$env:MONITOR_URL = "https://<api-service>.onrender.com/health/ready"
npm run monitor
```

This repository monitor runs in your terminal and checks readiness, including database and triage-model status. The separate external uptime monitor should call `https://<api-service>.onrender.com/health/live` every 5 minutes; it checks process liveness and can help wake the free service. Configure that monitor after deployment and record its name and evidence.


`npm run monitor` polls `/health/ready` (env: `MONITOR_URL`, `INTERVAL_MS`, `TIMEOUT_MS`, `ALERT_AFTER`, `MAX_CHECKS`). A check is **bad** if it is not `200` with `status: ok` (including timeouts). Rules, verified by `scripts/monitor.test.mjs`:

```
degraded (1/3) -> degraded (2/3) -> degraded (3/3) -> alert (once) -> ok -> resolved -> ok -> ok ...
```

- Three consecutive bad checks raise exactly one `monitor.alert`; it is not repeated during the same outage.
- The first `200 ok` after an alert logs `monitor.ok` then `monitor.resolved` (with `downtimeMs`); the following `ok` lines are the post-recovery verification.
- One or two bad checks followed by an OK never alert.

External signal: an uptime monitor calls `GET <API_URL>/health/live` every 5 minutes (also helps keep the free backend awake). **Evidence pending:** monitor name and screenshot.

## 7. Failure drills and recovery runbook

Each drill: break, observe (health, logs, monitor), recover, then prove the critical path again (`npm run verify:smoke`).

### Drill A (headline): database unreachable
1. Start `npm run monitor` against `<API_URL>/health/ready`.
2. Break: change the database password in Neon (or set a wrong `DATABASE_URL` in Render) so new connections fail. Existing pooled connections may delay the first failure; rehearse this before the evidence run.
3. Observe: `/health/ready` -> `503`, `checks.database: fail`; log `health.check` `status=down` with an error code; monitor `degraded x3` then `alert`.
4. Recover: put the correct connection string in `DATABASE_URL` (Render -> Environment) and redeploy (or roll back to the previous deploy).
5. Observe: `/health/ready` -> `200`; monitor `ok`, `resolved`, then more `ok`.
6. Prove: `npm run verify:smoke` passes (login, create, boundaries, lifecycle, persistence).
Evidence: **Evidence pending** (monitor output, Render log excerpt, smoke output, timestamps).

### Drill B: triage model unavailable (Week 4 rule: AI is not authority)
1. Break: set a wrong `AI_BASE_URL` and restart; click *Get AI suggestion* once.
2. Observe: triage returns 503/502 with a clear message; log `ai.triage.failed` with the reason; `/health/ready` -> `200 degraded`, `triageModel: unavailable`; monitor shows degraded and alert.
3. The employee can still choose a department and submit manually.
4. Recover: restore `AI_BASE_URL`, restart, trigger one triage call: `triageModel: ok`, monitor `resolved`.
Evidence: **Evidence pending**.

### Drill C: backend asleep (free-tier behavior, known risk)
After 15+ minutes idle the API sleeps; the first request takes up to about a minute. Mitigation: external monitor every 5 minutes. With `TIMEOUT_MS` below the wake time the monitor reports degraded/alert and resolves once a request wakes the service. Evidence: **Evidence pending**.

### Drill D: empty or replaced database
Create a new Neon database, set `DATABASE_URL` and `DB_SYNCHRONIZE=true`, deploy, run `npm --prefix backend run db:seed` (recreates Staff/Admin profiles from `FIREBASE_ROLE_ASSIGNMENTS`), set `DB_SYNCHRONIZE=false`, redeploy, check `/health/ready` = `200`, run the smoke test. Employees re-register on first sign-in. Evidence: **Evidence pending**.

## 8. Release gate

`npm run verify:release` (also run in GitHub Actions on pushes to any branch and pull requests): clean install, lint, backend/frontend typechecks, backend unit and integration tests, builds, Playwright E2E, AI evaluations, monitor state-machine tests, and repository secret scan. Any failure stops it with a non-zero exit code. Result for the submitted SHA: **Evidence pending** (Actions run link).

### Run the live smoke from PowerShell

Run this from the repository root after deployment. Replace the URL, SHA, Firebase Web API key, and account details locally. Use the IT Staff demo account assigned to `DEPT-IT`. These values are read from the current PowerShell session; do not add them to a tracked file or paste passwords into evidence screenshots.

```powershell
$env:BASE_URL = "https://<api-service>.onrender.com"
$env:EXPECT_RELEASE = "<full-deployed-commit-sha>"
$env:FIREBASE_API_KEY = "<firebase-web-api-key>"
$env:SMOKE_EMPLOYEE_EMAIL = "<employee-demo-email>"
$env:SMOKE_EMPLOYEE_PASSWORD = "<employee-demo-password>"
$env:SMOKE_STAFF_EMAIL = "<it-staff-demo-email>"
$env:SMOKE_STAFF_PASSWORD = "<it-staff-demo-password>"
npm run verify:smoke

Remove-Item Env:BASE_URL, Env:EXPECT_RELEASE, Env:FIREBASE_API_KEY, Env:SMOKE_EMPLOYEE_EMAIL, Env:SMOKE_EMPLOYEE_PASSWORD, Env:SMOKE_STAFF_EMAIL, Env:SMOKE_STAFF_PASSWORD
```

The smoke signs into Firebase, checks readiness and the expected release, verifies rejected and allowed request actions, and confirms the final state persists. It creates and resolves a real demo request. Record the PASS output and timestamp without recording credential values. `verify:release` is the local release gate; `verify:smoke` is a separate live-deployment check.
## 9. Final smoke and GO decision

`npm run verify:smoke` against the live API for the submitted SHA: health and release match, no-token request rejected (401), invalid input rejected (400), Employee cannot change status (403), Staff cannot jump Open to Resolved (400), valid lifecycle succeeds, updated state persists. Output and timestamp: **Evidence pending**.

**Decision: NO-GO (current).** The required live release, final-SHA CI result, stranger checks, recovery evidence, smoke output, and owner statement are not recorded yet. Change to GO only when each corresponding hard-fail row above has passing, reviewable evidence.

## 10. Remaining risks (be honest)

- Free-tier backend sleeps when idle; wake it before use. Mitigated, not eliminated.
- Free database limits (size, compute suspension) apply; recovery path is Drill D.
- No migrations tool: after the first deploy, schema changes are a manual step (ADR-001).
- Integration tests run on SQLite; the Postgres path is covered by the live smoke test.
- Health `triageModel` reflects real calls, so it only recovers after a call or the TTL.

## 11. Ownership: where AI helped, what I verified

**Owner statement pending:** where AI assisted (code for health/logging/monitor/scripts, documentation drafts), and what you personally ran and checked (tests, drills, smoke, fresh-clone run).
