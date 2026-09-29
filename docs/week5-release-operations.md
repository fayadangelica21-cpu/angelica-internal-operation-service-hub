# Week 5: Release Operations

This runbook is the operational handoff for an engineer, operator, and stranger user. It records how to identify, check, intentionally fail, and recover the live Operations Hub. It must contain observed evidence, not planned steps presented as completed.

## Slide hard-fail gate: current evidence disposition

A missing or failing item below means NO-GO. Do not claim a pass from source code or local tests where the slide requires live proof.

| Hard-fail condition | Evidence required to pass | Current disposition |
|---|---|---|
| Repository inaccessible, submitted SHA unknown, or deployed SHA mismatch | Public repository URL, frozen submitted SHA, and the same SHA from `/health/ready` | Public repository and initial deployed SHA verified; final submission SHA pending |
| No reachable remote app or grader cannot enter/use it | Live frontend URL and private-window journey using the demo roles | Frontend loads and Employee submission works; full private-window journey pending |
| Core journey, persistence, authorization, validation, or Week 4 behavior broken | UI journey evidence showing create, allowed work, rejected boundary, persisted state, and manual intake when AI fails | Employee reload persistence and Staff lifecycle reported complete; live smoke passed create, persistence, authorization boundaries, and lifecycle. Manual intake during the AI outage was also confirmed in the UI. |
| Required checks red/missing or real secret committed | Green CI on final SHA and clean secret scan; confirm no current secret in tracked files | Initial release checks passed; CI and secret scan for the final evidence SHA are pending |
| Health/operations evidence missing or no real recovery | Captured health/log/monitor signals and a completed failure, recovery, and post-recovery critical-path check | External monitor is Up; AI failure and monitor resolution are recorded, and post-recovery smoke passed. Post-restart AI-provider confirmation and the database drill remain pending |
| Owner cannot defend the work | Owner's account of AI assistance, personal verification, decisions, and remaining risk | Owner statement pending |

**Current decision: NO-GO.** The initial live release is reachable and its SHA is verified by readiness. Employee persistence, Staff lifecycle, authorization boundaries, and live smoke have now been verified. Local empty-database rebuild and database-connection failure/recovery rehearsals passed against `hub_rebuild_test`; the health-check timeout fix and these database drill results are not yet on a final deployed SHA. The final frozen SHA, private-window evidence, final-SHA CI/deployment, post-restart AI-provider confirmation, and owner statement still need evidence. Change this only after the remaining hard-fail evidence is recorded.

## 1. Release identification

| Item | Value |
|---|---|
| Repository | `https://github.com/fayadangelica21-cpu/angelica-internal-operation-service-hub` |
| Currently deployed initial SHA | `e3e94dca76462f23b14f04ddfcacf1b5c9de7b58` (confirmed by the readiness response) |
| Submitted (frozen) SHA | Pending final evidence commit, deployment, and readiness SHA check |
| Frontend | https://hub-web-74n0.onrender.com |
| API | https://hub-api-ep8z.onrender.com |
| How to see the running release | `GET https://hub-api-ep8z.onrender.com/health/ready` -> `release` (the deployed commit SHA, from `RENDER_GIT_COMMIT`). The final submitted SHA must equal this value. Every log line also carries `release`. |

### Observed initial live release (2026-09-29)

- Frontend: https://hub-web-74n0.onrender.com; API: https://hub-api-ep8z.onrender.com.
- Deployment wiring: API `CORS_ORIGINS` is set to the frontend origin; frontend `VITE_API_URL` is set to the API base URL. These values are public URLs, not secrets.
- Running SHA: `e3e94dca76462f23b14f04ddfcacf1b5c9de7b58`, matching the `release` field returned by readiness.
- Readiness observed: `status: ok`, `database: ok`, `triageModel: ok`. The healthy triage state followed a successful AI suggestion.
- Employee request submission, persistence after reload, and the Staff lifecycle were verified by the owner. The live smoke also passed request persistence and the Staff lifecycle.
- The AI suggestion eventually succeeded with Requesty model `google/gemma-4-31b-it` after a prior provider timeout at the default 15-second timeout. The successful call was slow. The controlled AI failure, monitor alert/resolution, and post-recovery smoke are now recorded; AI-provider success after the latest restart still needs confirmation.
- Live smoke evidence (2026-09-29): `npm run verify:smoke` passed against the API for this SHA. Readiness was `status=ok`, database `ok`, and `triageModel=unknown` at the start of the run; the smoke then passed release match, unauthenticated rejection, Staff role resolution, validation, Employee request creation and persistence, authorization boundaries, Staff lifecycle, and final Employee-visible resolved state. The smoke does not test AI triage. The final evidence-update commit still needs to be published, deployed, and checked against its own SHA.

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
| `AI_TIMEOUT_MS` | API | Provider request timeout; configured to 30000 ms for the live Requesty call after the initial 15-second timeout | no |
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
$env:MONITOR_URL = "https://hub-api-ep8z.onrender.com/health/ready"
npm run monitor
```

This repository monitor runs in your terminal and checks readiness, including database and triage-model status. The separate external uptime monitor should call `https://hub-api-ep8z.onrender.com/health/live` every 5 minutes; it checks process liveness and can help wake the free service. Configure that monitor after deployment and record its name and evidence.


`npm run monitor` polls `/health/ready` (env: `MONITOR_URL`, `INTERVAL_MS`, `TIMEOUT_MS`, `ALERT_AFTER`, `MAX_CHECKS`). A check is **bad** if it is not `200` with `status: ok` (including timeouts). Rules, verified by `scripts/monitor.test.mjs`:

```
degraded (1/3) -> degraded (2/3) -> degraded (3/3) -> alert (once) -> ok -> resolved -> ok -> ok ...
```

- Three consecutive bad checks raise exactly one `monitor.alert`; it is not repeated during the same outage.
- The first `200 ok` after an alert logs `monitor.ok` then `monitor.resolved` (with `downtimeMs`); the following `ok` lines are the post-recovery verification.
- One or two bad checks followed by an OK never alert.

External signal: UptimeRobot HTTP/S monitor `804125963` checks `GET https://hub-api-ep8z.onrender.com/health/live` every 5 minutes (also helps keep the free backend awake). Dashboard showed **Up** on 2026-09-29; it also records one initial 502 incident, resolved after 10m 11s. Save the dashboard screenshot with the submission evidence. This confirms current reachability; controlled failure/recovery drill evidence remains pending.

Repository readiness monitor baseline (2026-09-29, 19:11:48-19:12:55 UTC): the user-provided terminal output showed repeated monitor.ok checks with HTTP 200 for release e3e94dca76462f23b14f04ddfcacf1b5c9de7b58. This is healthy baseline evidence only; no controlled outage was induced.

## 7. Failure drills and recovery runbook

Each drill: break, observe (health, logs, monitor), recover, then prove the critical path again (`npm run verify:smoke`).

### Drill A (headline): database unreachable
1. Start `npm run monitor` against `https://hub-api-ep8z.onrender.com/health/ready`.
2. Break: change the database password in Neon (or set a wrong `DATABASE_URL` in Render) so new connections fail. Existing pooled connections may delay the first failure; rehearse this before the evidence run.
3. Observe: `/health/ready` -> `503`, `checks.database: fail`; log `health.check` `status=down` with an error code; monitor `degraded x3` then `alert`.
4. Recover: put the correct connection string in `DATABASE_URL` (Render -> Environment) and redeploy (or roll back to the previous deploy).
5. Observe: `/health/ready` -> `200`; monitor `ok`, `resolved`, then more `ok`.
6. Prove: `npm run verify:smoke` passes (login, create, boundaries, lifecycle, persistence).
**Local test-database rehearsal (2026-09-29):** the API was stopped and restarted with a deliberately unreachable loopback PostgreSQL URL; no Neon password, production database, or Render setting was changed. The local monitor logged `monitor.alert` after three consecutive checks failed with `status=0`, `reason=unreachable` (captured at 20:34:48 UTC). During recovery, the local API was restarted with the saved Neon `hub_rebuild_test` URL; startup reported `database=postgres`, readiness returned `status=ok`, `database=ok`, and the monitor later logged `monitor.resolved` followed by repeated `monitor.ok` checks (captured at 20:41:25 UTC). The recovered local API then passed the full live-smoke script against the test database. This simulated a connection failure that prevented local API startup, so the monitor observed an unreachable API rather than an HTTP 503 from a running API with a failed database check. This is not a production Render drill. Evidence: user-provided terminal output in chat; screenshots not saved yet.

### Drill B: triage model unavailable (Week 4 rule: AI is not authority)
1. Break: set a wrong `AI_BASE_URL` and restart; click *Get AI suggestion* once.
2. Observe: triage returns 503/502 with a clear message; log `ai.triage.failed` with the reason; `/health/ready` -> `200 degraded`, `triageModel: unavailable`; monitor shows degraded and alert.
3. The employee can still choose a department and submit manually.
4. Recover: restore `AI_BASE_URL`, restart, trigger one triage call: `triageModel: ok`, monitor `resolved`.
Observed AI failure evidence (2026-09-29): with `AI_BASE_URL` temporarily set to an invalid URL, readiness returned `status=degraded`, `database=ok`, `triageModel=unavailable` on release `e3e94dca76462f23b14f04ddfcacf1b5c9de7b58`. The readiness monitor logged `monitor.degraded` counts 1, 2, and 3 at 19:22:05.886Z, 19:22:11.446Z, and 19:22:16.983Z, then one `monitor.alert` at 19:22:16.984Z; further degraded checks followed without repeating the alert. The owner confirmed that the UI showed the AI error and the Employee successfully submitted a request by choosing a department manually during the outage. The owner reports that `AI_BASE_URL` was restored. Recovery monitor evidence (2026-09-29): `monitor.resolved` at 19:34:56.837Z reported `downtimeMs=393080` (about 6m 33s), followed by repeated `monitor.ok` checks through 19:36:19.820Z for release `e3e94dca76462f23b14f04ddfcacf1b5c9de7b58`. This confirms overall readiness recovery. The latest supplied readiness response after restart was `status=ok`, `database=ok`, `triageModel=unknown`. This is a neutral state: it means no provider result has been recorded in the current process since it started, not that AI failed. The post-recovery `npm run verify:smoke` passed on 2026-09-29 for the same SHA, with readiness `status=ok`, database `ok`, and `triageModel=unknown`. A post-restart provider result has not yet been observed in readiness; the owner reports AI suggestions work, and a successful live Requesty call was observed earlier. The post-recovery smoke passed. Earlier, after increasing the live Requesty timeout to 30000 ms, the owner reported a slow successful AI suggestion; that observation is not recovery evidence for this controlled drill.

### Drill C: backend asleep (free-tier behavior, known risk)
After 15+ minutes idle the API sleeps; the first request takes up to about a minute. Mitigation: external monitor every 5 minutes. With `TIMEOUT_MS` below the wake time the monitor reports degraded/alert and resolves once a request wakes the service. Evidence: **Evidence pending**.

### Drill D: empty or replaced database
Create a new Neon database, set `DATABASE_URL` and `DB_SYNCHRONIZE=true`, deploy, run `npm --prefix backend run db:seed` (recreates Staff/Admin profiles from `FIREBASE_ROLE_ASSIGNMENTS`), set `DB_SYNCHRONIZE=false`, redeploy, check `/health/ready` = `200`, run the smoke test. Employees re-register on first sign-in. **Local rehearsal passed (2026-09-29):** created Neon database `hub_rebuild_test`, set its connection URL only in a local PowerShell session, ran the seed (`created=4`, `existing=0`), disabled synchronization, started the local API, and verified readiness (`database=ok`). The first local smoke run exposed a readiness timeout: `/health/ready` returned 503 after about 3 seconds while request operations succeeded. The shared 3-second timeout was changed locally to apply separately to each database query. After rebuilding and restarting, readiness returned `status=ok`, `database=ok`, and the local smoke passed all checks. A later local connection-failure/recovery rehearsal also ended with readiness healthy and a passing smoke. Production Render settings and the existing `neondb` database were not changed. This local rehearsal does not replace final-SHA hosted rebuild/deployment evidence. Evidence: local seed and smoke output were supplied in chat; no screenshots saved yet.

## 8. Release gate

`npm run verify:release` (also run in GitHub Actions on pushes to any branch and pull requests): clean install, lint, backend/frontend typechecks, backend unit and integration tests, builds, Playwright E2E, AI evaluations, monitor state-machine tests, and repository secret scan. Any failure stops it with a non-zero exit code. Result for the submitted SHA: **Evidence pending** (Actions run link).

**Local working-tree release check (2026-09-29):** `npm run verify:release` reached the final `verify:secrets OK` result. Lint and backend/frontend typechecks passed; backend tests passed (11 suites, 93 tests); backend/frontend builds passed; Playwright passed (18 tests); AI evaluations passed (19 tests); monitor script tests passed (3 tests); secret scan passed (99 files). This run was against the local working tree, which includes uncommitted changes. It is not CI evidence for a frozen commit and does not prove that these changes are deployed.

### Run the live smoke from PowerShell

Run this from the repository root after deployment. Replace the URL, SHA, Firebase Web API key, and account details locally. Use the IT Staff demo account assigned to `DEPT-IT`. These values are read from the current PowerShell session; do not add them to a tracked file or paste passwords into evidence screenshots.

```powershell
$env:BASE_URL = "https://hub-api-ep8z.onrender.com"
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

Both the initial and post-recovery `npm run verify:smoke` runs passed on 2026-09-29 against `https://hub-api-ep8z.onrender.com` for deployed SHA `e3e94dca76462f23b14f04ddfcacf1b5c9de7b58`. The post-recovery run passed readiness (`status=ok`, database `ok`, triage model `unknown`), release match, no-token rejection (401), Staff role resolution (`DEPT-IT`), invalid input rejection (400), Employee status-change rejection (403), invalid lifecycle jump rejection (400), request creation (201), persistence, allowed Staff lifecycle, and Employee-visible resolved state. No request identifier was printed by the script. Run date recorded; exact time was not supplied. The smoke does not test AI triage.

**Decision: NO-GO (current).** The initial live release, deployed SHA, healthy database readiness, and passing live smoke are recorded above. Final-SHA CI, fresh-clone checks, database recovery drill, post-restart AI-provider confirmation, and owner statement remain pending; post-recovery smoke passed. Change to GO only when each corresponding hard-fail row above has passing, reviewable evidence.

## 10. Remaining risks (be honest)

- Free-tier backend sleeps when idle; wake it before use. Mitigated, not eliminated.
- Free database limits (size, compute suspension) apply; recovery path is Drill D.
- No migrations tool: after the first deploy, schema changes are a manual step (ADR-001).
- Integration tests run on SQLite; the Postgres path is covered by the live smoke test.
- Health `triageModel` reflects real calls, so it only recovers after a call or the TTL.

## 11. Ownership: where AI helped, what I verified

**Owner statement pending:** where AI assisted (code for health/logging/monitor/scripts, documentation drafts), and what you personally ran and checked (tests, drills, smoke, fresh-clone run).
