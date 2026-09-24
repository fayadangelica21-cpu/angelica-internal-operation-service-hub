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
- Backend-controlled AI triage step via `POST /triage` with a strict fixed JSON response contract
- AI payload is bounded to only the information needed for triage; the backend validates the response before showing it
- Authorization: an employee can create a request as themselves; another employee cannot read it (`403`)
- Invalid input rejected on purpose (`400`)
- Missing request handled on purpose (`404`)
- Automated business-rule, integration, and E2E tests
- Regression protection for the forbidden `Open → Resolved` jump

Out of scope for Week 4: real SSO, notifications, CI/CD, deployment, and production infrastructure. Identity for local runs uses development headers. The backend still makes every authorization decision.

---

## Prerequisites

- Node.js 20+
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

Create a local `.env` file for backend runtime settings. The app loads it at startup through `dotenv.config()`, so the AI provider and database settings are available before the NestJS app begins serving requests. The template in `.env.example` is intentionally minimal and should be filled in with your local secrets.

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

The frontend uses Vite environment variables for local configuration. These are typed in `frontend/src/vite-env.d.ts` and read from `frontend/src/config.ts`.

Optional frontend env (`frontend/.env.example`):

```text
VITE_API_URL=http://localhost:3001
VITE_USER_ID=EMP-001
VITE_USER_ROLE=Employee
```

This file is standard Vite setup so TypeScript recognizes `import.meta.env` without errors. The frontend in this Week 4 slice runs as an Employee. Staff/Admin identities are exercised through API/curl tests.

### Stop the project

The backend and frontend run in separate terminals.

Press Ctrl + C in each terminal to stop the corresponding process.

The SQLite database remains on disk at:

backend/data/service-hub.sqlite

---

## Exercise the user-facing flow

1. Open `http://localhost:5173`.
2. Select IT, HR, or Finance, or keep the assistant's suggested department only if you explicitly choose it with the assistant action.
3. Enter a description (for example `Laptop screen flickers`).
4. Click **Get AI triage suggestion**.
5. Review the recommendation, including the suggested department, confidence, and next step. The suggestion is advisory only; it is not silently applied to the form.
6. Either keep your current department or click **Use suggested department** to update the selected route before submission.
7. Click **Submit request**.
8. The UI should show the created request with status **Open**.

The frontend sends `POST /requests`. The backend derives `requesterId` from identity headers, not from the JSON body, and all request creation rules are enforced server-side.

---

## API contract

Local identity headers (development adapter, not production auth):

```text
x-user-id
x-user-role          Employee | Staff | Admin
x-user-department-id required for Staff
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
x-user-id: EMP-001
x-user-role: Employee

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

The AI recommendation is advisory in the UI. The frontend shows it to the user, but it does not silently overwrite the employee's currently selected department; the user must choose the suggestion explicitly if they want to apply it.

### Create a request

```http
POST /requests
Content-Type: application/json
x-user-id: EMP-001
x-user-role: Employee

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
  "requesterId": "EMP-001",
  "description": "Laptop screen flickers",
  "status": "Open",
  "ownerId": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

`departmentId` must be `DEPT-IT`, `DEPT-HR`, or `DEPT-FINANCE`. Description is required (whitespace-only is rejected).

### Read a request

```http
GET /requests/:id
```

| Result | Meaning |
|---|---|
| `200` | Request exists and the caller may access it |
| `403` | Request exists, but this caller may not access it |
| `404` | No request with that ID |

### Assign and resolve (Week 2 lifecycle, still enforced)

- `PATCH /requests/:id/assign` with `{ "ownerId": "<staff-id>" }` — Staff in that department take ownership. Status becomes `In Progress`.
- `PATCH /requests/:id/status` with `{ "targetStatus": "Resolved" }` — Staff resolve an in-progress request. Starting work through this endpoint is rejected; use assign.

---

## Boundary checks (curl)

Backend must be running. Git Bash / macOS / Linux syntax:

**Create (allowed)**

```bash
curl -X POST http://localhost:3001/requests \
  -H "Content-Type: application/json" \
  -H "x-user-id: EMP-001" \
  -H "x-user-role: Employee" \
  -d '{"departmentId":"DEPT-IT","description":"Laptop screen flickers"}'
```

Expected: `201`, `status=Open`, `requesterId=EMP-001`.

**Invalid payload (rejected on purpose)**

```bash
curl -X POST http://localhost:3001/requests \
  -H "Content-Type: application/json" \
  -H "x-user-id: EMP-001" \
  -H "x-user-role: Employee" \
  -d '{"departmentId":"DEPT-IT"}'
```

Expected: `400 Bad Request`.

**Missing resource (handled on purpose)**

```bash
curl http://localhost:3001/requests/not-a-real-request \
  -H "x-user-id: EMP-001" \
  -H "x-user-role: Employee"
```

Expected: `404 Not Found`.

**Authorization denied**

Create a request as `EMP-001`, then:

```bash
curl http://localhost:3001/requests/<REQUEST_ID> \
  -H "x-user-id: EMP-002" \
  -H "x-user-role: Employee"
```

Expected: `403 Forbidden`.

**Lifecycle (Week 2, still valid)**

```bash
curl -X PATCH http://localhost:3001/requests/<REQ_ID>/assign \
  -H "Content-Type: application/json" \
  -H "x-user-id: STAFF-IT-01" \
  -H "x-user-role: Staff" \
  -H "x-user-department-id: DEPT-IT" \
  -d '{"ownerId":"STAFF-IT-01"}'
```

Expected: `200`, status `In Progress`.

```bash
curl -X PATCH http://localhost:3001/requests/<REQ_ID>/status \
  -H "Content-Type: application/json" \
  -H "x-user-id: STAFF-IT-01" \
  -H "x-user-role: Staff" \
  -H "x-user-department-id: DEPT-IT" \
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
| `npm run test:unit` | Lifecycle allowed: `Open → In Progress → Resolved`. Regression: `Open → Resolved` rejected. `Resolved` is terminal. |
| `npm run test:integration` | SQLite persistence plus HTTP `400` / `403` / `404` boundaries |
| `npm run test:ai-eval` | AI provider contract validation: unexpected keys, unsupported enum values, and fallback behavior for provider failures. |
| `npm run test:all` | All backend tests |

### E2E

Start the backend on port `3001` first, then:

```bash
cd frontend
npm install
npx playwright install
npm run test:e2e
```

The browser test submits a request and verifies that the successful result is displayed with status 'Open'.

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
├── README.md
├── .gitignore
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
│   ├── tsconfig.build.tsbuildinfo
│   ├── tsconfig.tsbuildinfo
│   ├── src/
│   │   ├── app.module.ts
│   │   ├── main.ts
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
│       ├── requests-db.integration.spec.ts
│       └── requests-http.spec.ts
└── frontend/
    ├── .env.example
    ├── .gitignore
    ├── index.html
    ├── package.json
    ├── package-lock.json
    ├── playwright.config.ts
    ├── tsconfig.json
    ├── vite.config.ts
    ├── e2e/
    │   └── request-flow.spec.ts
    └── src/
        ├── App.tsx
        ├── api.ts
        ├── config.ts
        ├── main.tsx
        ├── styles.css
        └── vite-env.d.ts
```
TypeORM `synchronize` is enabled for this local SQLite slice only.
