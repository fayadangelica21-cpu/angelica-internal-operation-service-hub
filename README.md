# Internal Operations Service Hub

```text
Week 1 — Product specification, architecture, data model
Week 2 — Verified Open → In Progress → Resolved lifecycle
Week 3 — React + NestJS + SQLite product slice
Week 4 — Backend-controlled AI triage suggestion contract
```

Employees submit one internal service request (IT, HR, or Finance). The backend owns validation, authorization, persistence, and lifecycle rules. A new backend-controlled AI triage step can suggest a likely department and next step before the final request is submitted.

```text
Open → In Progress → Resolved
```

---

## What this slice includes

- React form for submitting a request and AI-assisted triage workflow
- AI assistant UI for department suggestions, confidence scoring, and suggested next steps
- NestJS API with an explicit contract
- SQLite persistence through TypeORM
- Firebase-authenticated Staff can view active requests in their assigned department; the backend derives the department from the verified identity
- Backend-controlled AI triage step via `POST /triage` with a strict fixed JSON response contract
- AI payload is bounded to only the information needed for triage; the backend validates the response before showing it
- Authorization: an employee can create a request as themselves; another employee cannot read it (`403`)
- Department queue authorization tests ensure Staff cannot see other departments' requests and resolved requests are excluded
- Invalid input rejected on purpose (`400`)
- Missing request handled on purpose (`404`)
- Automated business-rule, integration, and E2E tests
- Regression protection for the forbidden `Open → Resolved` jump

Out of scope for Week 4: company SSO, notifications, CI/CD, deployment, and production infrastructure. Firebase Authentication provides email/password sign-in for this project. The backend verifies Firebase ID tokens and makes every authorization decision.

---

## Prerequisites

- Node.js 20.19+ or 22.12+ (Vite 8 requirement)
- npm

No separate database server is required.

---

## Install and run

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
npm run start:dev
```

Create a local `.env` file for backend runtime settings. The app loads it at startup through `dotenv.config()`, so the AI provider and database settings are available before the NestJS app begins serving requests. Keep local secrets and service-account credentials out of source control.

Set `FIREBASE_PROJECT_ID` to the Firebase project ID. Configure Google Application Default Credentials for this Firebase project on the backend machine; keep any service-account file outside the repository and never commit it. `FIREBASE_ROLE_ASSIGNMENTS` maps trusted Firebase UIDs to `Employee`, `Staff`, or `Admin` (with `departmentId` for Staff). Use the UID shown for each account in Firebase; do not map privileged roles by email because email addresses can be claimed during public signup. Unmapped signed-in accounts are Employees. The browser cannot set roles or staff departments.

After Firebase verifies a user's ID token, `GET /auth/me` creates or updates that account's profile in the local SQLite `users` table, keyed by Firebase UID. The profile stores email, display name, role, and department where applicable; passwords remain in Firebase and are never stored in SQLite. Public signup is for demo Employee accounts and does not verify company employment.

If `AI_BASE_URL` and `AI_API_KEY` are not set, the backend still starts successfully and uses a deterministic local fallback suggestion instead of failing the process. If both are present, the app logs that the live provider is enabled and the AI path is active.

Example backend `.env`:

```env
PORT=3001
DATABASE_PATH=data/service-hub.sqlite
AI_BASE_URL=https://router.requesty.ai/v1
AI_API_KEY=your-local-requesty-key
AI_MODEL=google/gemma-4-31b-it
```

`AI_MODEL` is just an example model name for local configuration; the app does not require this exact value to start, and missing AI config falls back to a deterministic local suggestion.

The backend appends `/chat/completions` automatically, so `AI_BASE_URL` must be the base URL only, not the full chat-completions URL.

API: `http://localhost:3001`

SQLite file (created on first start): `backend/data/service-hub.sqlite`

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

UI: `http://localhost:5173`

The Firebase web-app settings have defaults in `frontend/src/auth.tsx`, so no frontend environment file is required for this project configuration. The Vite development server proxies API calls to `http://localhost:3001`. Enable Email/Password in Firebase Authentication before testing signup and login.

Employees can create accounts from the app. Create Staff/Admin accounts in Firebase, copy each account's UID, then add its UID, role, and (for Staff) department to backend `FIREBASE_ROLE_ASSIGNMENTS`. The app shows the request form only to Employees; Staff/Admin sign in but see an access page until their role-specific feature is built.

### Stop the project

The backend and frontend run in separate terminals.

Press Ctrl + C in each terminal to stop the corresponding process.

The SQLite database remains on disk at:

backend/data/service-hub.sqlite

---

## Exercise the user-facing flow

1. Open `http://localhost:5173` and sign in, or create an Employee account.
2. Enter a description (for example `Laptop screen flickers`).
3. Click **Get AI suggestion**. If triage returns a department, the form selects it automatically; you can still change the department before submitting.
4. Review the recommendation, confidence, and suggested next step.
5. Click **Submit request**.
6. The UI should show the created request with status **Open**.

The frontend sends `POST /requests` with a Firebase ID token. The backend verifies the token and derives `requesterId` from its UID, not from the JSON body or identity headers.

---

## API contract

Authenticated API requests use:

```text
Authorization: Bearer <FIREBASE_ID_TOKEN>

Roles and Staff department IDs come from backend `FIREBASE_ROLE_ASSIGNMENTS` configuration. `x-user-id`, `x-user-role`, and `x-user-department-id` headers are ignored.
```

### Triage a request with AI (Week 4)

For the live AI path, configure a local backend `.env` before starting the API:

```env
AI_BASE_URL=https://router.requesty.ai/v1
AI_API_KEY=your-local-requesty-key
AI_MODEL=google/gemma-4-31b-it
```

`AI_MODEL` is an example model name only; it is not the app's required default. The backend will fall back to a deterministic local suggestion if the AI config is missing or unusable.

The provider call is built as:

```ts
`${baseUrl.replace(/\/$/, '')}/chat/completions`
```

So `AI_BASE_URL` must be the base URL, not the full chat-completions URL. The backend reads the runtime config at startup via `dotenv.config()`, and if it is missing it logs a fallback mode instead of crashing.

The AI triage flow also has a local safety check before it calls the provider:

- if the description is shorter than 20 characters after trimming, the backend short-circuits and returns a `thin` classification with `requiresMoreInfo: true`
- it does not call the external provider for those brief descriptions
- the response is still fully shaped to the contract and is safe to show in the UI

```http
POST /triage
Content-Type: application/json
Authorization: Bearer <FIREBASE_ID_TOKEN>

{
  "description": "Laptop screen flickers and the battery drains quickly",
  "selectedDepartmentId": "DEPT-IT"
}
```

Success (`201`):

```json
{
  "draftId": "triage_123456789",
  "departmentId": "DEPT-IT",
  "issueType": "hardware",
  "suggestedNextStep": "Ask the employee whether the issue affects the screen, battery, or docking equipment before routing to IT support.",
  "confidence": 0.92,
  "requiresMoreInfo": false,
  "classification": "clear",
  "reasoning": "The description clearly matches a laptop hardware problem and likely IT triage."
}
```

Contract rules enforced by the backend:

- `draftId` is backend-owned; any model-supplied value is ignored
- `departmentId` must be one of `DEPT-IT`, `DEPT-HR`, or `DEPT-FINANCE` or `null`
- `issueType`, `classification`, and `confidence` must all match the allowed fixed enums and ranges
- unsupported keys are rejected
- low-confidence clear outputs are downgraded to `ambiguous` with a follow-up prompt
- provider timeouts and provider-level failures are mapped to `503` semantics, while malformed provider outputs or invalid JSON are treated as `502`

The AI recommendation is advisory: after the backend returns a validated suggestion with a department, the frontend selects that department automatically. The employee can still change the department before submitting; the suggestion does not create or modify a request by itself.

### Create a request

```http
POST /requests
Content-Type: application/json
Authorization: Bearer <FIREBASE_ID_TOKEN>

{
  "departmentId": "DEPT-IT",
  "description": "Laptop screen flickers"
}
```

Success (`201`):

```json
{
  "id": "uuid",
  "departmentId": "DEPT-IT",
  "requesterId": "<FIREBASE_UID>",
  "description": "Laptop screen flickers",
  "status": "Open",
  "ownerId": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

`departmentId` must be `DEPT-IT`, `DEPT-HR`, or `DEPT-FINANCE`. Description is required (whitespace-only is rejected).

### View the department queue

```http
GET /requests/queue
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

This endpoint is for authenticated Staff accounts. The backend derives the department from the verified account and returns only that department's active `Open` and `In Progress` requests, newest first. The client cannot select or override the department. Employees, Admins, and Staff accounts without an assigned department receive `403 Forbidden`.

### Read a request

```http
GET /requests/:id
```

| Result | Meaning |
|---|---|
| `200` | Request exists and the caller may access it |
| `403` | Request exists, but this caller may not access it |
| `404` | No request with that ID |

### Process a request (Staff)

- Take an `Open` request: `PATCH /requests/:id/assign` with `{ "ownerId": "<your Firebase UID>" }`. The backend verifies the owner matches the authenticated Staff user, then changes the request to `In Progress`.
- Resolve an `In Progress` request: `PATCH /requests/:id/status` with `{ "targetStatus": "Resolved" }`. The request leaves the active department queue.

Both actions require Staff authorization for the request's department. Invalid lifecycle transitions are rejected, and a competing claim cannot replace an existing owner; refresh the queue if another Staff member takes the request first.
After a successful claim, the request moves to the top of the department queue.

---

## Boundary checks (curl)

Backend must be running. Git Bash / macOS / Linux syntax:

**Create (allowed)**

```bash
curl -X POST http://localhost:3001/requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $EMPLOYEE_ID_TOKEN" \
  -d '{"departmentId":"DEPT-IT","description":"Laptop screen flickers"}'
```

Expected: `201`, `status=Open`, and `requesterId` equal to the authenticated Firebase UID.

**Invalid payload (rejected on purpose)**

```bash
curl -X POST http://localhost:3001/requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $EMPLOYEE_ID_TOKEN" \
  -d '{"departmentId":"DEPT-IT"}'
```

Expected: `400 Bad Request`.

**Missing resource (handled on purpose)**

```bash
curl http://localhost:3001/requests/not-a-real-request \
  -H "Authorization: Bearer $EMPLOYEE_ID_TOKEN"
```

Expected: `404 Not Found`.

**Authorization denied**

Create a request as `EMP-001`, then:

```bash
curl http://localhost:3001/requests/<REQUEST_ID> \
  -H "Authorization: Bearer $OTHER_EMPLOYEE_ID_TOKEN"
```

Expected: `403 Forbidden`.

**Lifecycle (Week 2, still valid)**

```bash
curl -X PATCH http://localhost:3001/requests/<REQ_ID>/assign \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $IT_STAFF_ID_TOKEN" \
  -d '{"ownerId":"STAFF-IT-01"}'
```

Expected: `200`, status `In Progress`.

```bash
curl -X PATCH http://localhost:3001/requests/<REQ_ID>/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $IT_STAFF_ID_TOKEN" \
  -d '{"targetStatus":"Resolved"}'
```

Expected: `200`, status `Resolved`.

Direct `Open → Resolved` on a new request is still `400`.

On Windows PowerShell, send JSON with `Invoke-RestMethod` or use Git Bash for the `curl` examples above.

---

### Windows note

The examples use Git Bash syntax.

If you are using PowerShell, use `Invoke-RestMethod` instead.


## Automated tests

### Backend

```bash
cd backend
npm install
npm run test:all
```

| Command | What it proves |
|---|---|
| `npm run test:unit` | Request lifecycle rules, including valid `Open → In Progress → Resolved` transitions and rejection of invalid transitions. |
| `npm run test:integration` | SQLite persistence and HTTP authorization/validation boundaries, including Staff claim and resolve actions. |
| `npm run test:ai-eval` | AI provider contract validation: unexpected keys, unsupported enum values, and fallback behavior for provider failures. |
| `npm run test:all` | All backend tests |

### E2E

```bash
cd frontend
npm install
npx playwright install
npm run test:e2e
```

The Playwright suite runs Vite in a dedicated E2E mode with a test-only identity adapter and mocked API responses; it does not create accounts in your Firebase project. It covers employee signup/login/logout, role-based page visibility, request submission, and Staff processing a request from `Open` through `In Progress` to `Resolved`, including the short fade-and-slide as a resolved request leaves the queue while other queue cards stay visible. It also verifies that a claimed request moves to the top, and that a competing claim is reported so Staff can refresh the queue and see the updated state. To try real Firebase accounts, start the backend and frontend normally after configuring Firebase as described above.

---

## Documentation

| Document | Purpose |
|---|---|
| `docs/product-spec.md` | Product problem, actors, requirements |
| `docs/architecture.md` | System structure and trust boundaries |
| `docs/data-model.md` | Durable facts and lifecycle rules |
| `docs/week2-agentic-workflow.md` | Week 2 lifecycle verification |
| `docs/week3-full-stack-delivery.md` | Week 3 Build → Protect → Automate evidence |
| `docs/week4-production-ai.md` | Week 4 verified AI triage contract and Requesty integration |
| `docs/decisions/ADR-001-relational-database.md` | Database choice |

---

## Repository layout

```text
project/
├── .gitignore
├── README.md
├── .postman/
│   └── resources.yaml
├── postman/
│   ├── collections/
│   │   └── Academy Project/
│   │       ├── .resources/
│   │       │   └── definition.yaml
│   │       ├── Create Request.request.yaml
│   │       └── Get Request.request.yaml
│   └── globals/
│       └── workspace.globals.yaml
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   ├── product-spec.md
│   ├── week2-agentic-workflow.md
│   ├── week3-full-stack-delivery.md
│   ├── week4-production-ai.md
│   └── decisions/
│       └── ADR-001-relational-database.md
├── backend/
│   ├── .env.example
│   ├── .gitignore
│   ├── jest.config.js
│   ├── nest-cli.json
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── tsconfig.build.json
│   ├── tsconfig.spec.json
│   ├── src/
│   │   ├── app.module.ts
│   │   ├── main.ts
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.module.ts
│   │   │   ├── firebase-auth.guard.ts
│   │   │   ├── firebase-auth.service.ts
│   │   │   ├── firebase-auth.service.spec.ts
│   │   │   └── user.entity.ts
│   │   ├── requests/
│   │   │   ├── current-user.ts
│   │   │   ├── request-state-machine.service.ts
│   │   │   ├── request-state-machine.service.spec.ts
│   │   │   ├── requests.controller.ts
│   │   │   ├── requests.module.ts
│   │   │   ├── requests.service.ts
│   │   │   ├── dto/
│   │   │   │   ├── assign-request.dto.ts
│   │   │   │   ├── create-request.dto.ts
│   │   │   │   └── update-status.dto.ts
│   │   │   ├── entities/
│   │   │   │   └── request.entity.ts
│   │   │   └── enums/
│   │   │       └── request-status.enum.ts
│   │   └── triage/
│   │       ├── triage.controller.ts
│   │       ├── triage.dto.ts
│   │       ├── triage.service.ts
│   │       ├── triage.service.spec.ts
│   │       ├── triage-provider.service.ts
│   │       └── triage-provider.service.spec.ts
│   └── test/
│       ├── auth-http.spec.ts
│       ├── requests-db.integration.spec.ts
│       └── requests-http.spec.ts
└── frontend/
    ├── .gitignore
    ├── index.html
    ├── package.json
    ├── package-lock.json
    ├── playwright.config.ts
    ├── tsconfig.json
    ├── vite.config.mts
    ├── e2e/
    │   └── request-flow.spec.ts
    └── src/
        ├── App.tsx
        ├── AuthScreen.tsx
        ├── api.ts
        ├── auth.tsx
        ├── config.ts
        ├── main.tsx
        ├── styles.css
        └── vite-env.d.ts
```
This tree lists project source and configuration files; ignored local secrets, databases, dependencies, and generated build artifacts are omitted.
TypeORM `synchronize` is enabled for this local SQLite slice only.
