# Internal Operations Service Hub

```text
Week 1 — Product specification, architecture, data model
Week 2 — Verified Open → In Progress → Resolved lifecycle
Week 3 — React + NestJS + SQLite product slice
```

Employees submit one internal service request (IT, HR, or Finance). The backend owns validation, authorization, persistence, and lifecycle rules.

```text
Open → In Progress → Resolved
```

---

## What this slice includes

- React form for submitting a request
- NestJS API with an explicit contract
- SQLite persistence through TypeORM
- Authorization: an employee can create a request as themselves; another employee cannot read it (`403`)
- Invalid input rejected on purpose (`400`)
- Missing request handled on purpose (`404`)
- Automated business-rule, integration, and E2E tests
- Regression protection for the forbidden `Open → Resolved` jump

Out of scope for Week 3: real SSO, notifications, CI/CD, deployment, and production infrastructure. Identity for local runs uses development headers. The backend still makes every authorization decision.

---

## Prerequisites

- Node.js 20+
- npm

No separate database server is required.

---

## Install and run

### Backend

```bash
cd backend
npm install
npm run start:dev
```

API: `http://localhost:3000`

SQLite file (created on first start): `backend/data/service-hub.sqlite`

### Frontend

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
VITE_API_URL=http://localhost:3000
VITE_USER_ID=EMP-001
VITE_USER_ROLE=Employee
```

This file is standard Vite setup so TypeScript recognizes `import.meta.env` without errors. The frontend in this Week 3 slice runs as an Employee. Staff/Admin identities are exercised through API/curl tests.

### Stop the project

The backend and frontend run in separate terminals.

Press Ctrl + C in each terminal to stop the corresponding process.

The SQLite database remains on disk at:

backend/data/service-hub.sqlite

---

## Exercise the user-facing flow

1. Open `http://localhost:5173`.
2. Select IT, HR, or Finance.
3. Enter a description (for example `Laptop screen flickers`).
4. Click **Submit request**.
5. The UI should show the created request with status **Open**.

The frontend sends `POST /requests`. The backend derives `requesterId` from identity headers, not from the JSON body.

---

## API contract

Local identity headers (development adapter, not production auth):

```text
x-user-id
x-user-role          Employee | Staff | Admin
x-user-department-id required for Staff
```

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
curl -X POST http://localhost:3000/requests \
  -H "Content-Type: application/json" \
  -H "x-user-id: EMP-001" \
  -H "x-user-role: Employee" \
  -d '{"departmentId":"DEPT-IT","description":"Laptop screen flickers"}'
```

Expected: `201`, `status=Open`, `requesterId=EMP-001`.

**Invalid payload (rejected on purpose)**

```bash
curl -X POST http://localhost:3000/requests \
  -H "Content-Type: application/json" \
  -H "x-user-id: EMP-001" \
  -H "x-user-role: Employee" \
  -d '{"departmentId":"DEPT-IT"}'
```

Expected: `400 Bad Request`.

**Missing resource (handled on purpose)**

```bash
curl http://localhost:3000/requests/not-a-real-request \
  -H "x-user-id: EMP-001" \
  -H "x-user-role: Employee"
```

Expected: `404 Not Found`.

**Authorization denied**

Create a request as `EMP-001`, then:

```bash
curl http://localhost:3000/requests/<REQUEST_ID> \
  -H "x-user-id: EMP-002" \
  -H "x-user-role: Employee"
```

Expected: `403 Forbidden`.

**Lifecycle (Week 2, still valid)**

```bash
curl -X PATCH http://localhost:3000/requests/<REQ_ID>/assign \
  -H "Content-Type: application/json" \
  -H "x-user-id: STAFF-IT-01" \
  -H "x-user-role: Staff" \
  -H "x-user-department-id: DEPT-IT" \
  -d '{"ownerId":"STAFF-IT-01"}'
```

Expected: `200`, status `In Progress`.

```bash
curl -X PATCH http://localhost:3000/requests/<REQ_ID>/status \
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
| `npm run test:all` | All backend tests |

### E2E

Start the backend on port `3000` first, then:

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
| `docs/decisions/ADR-001-relational-database.md` | Database choice |

---

## Repository layout

```text

README.md

docs/
├── product-spec.md
├── architecture.md
├── data-model.md
├── decisions/
│   └── ADR-001-relational-database.md
├── week2-agentic-workflow.md
└── week3-full-stack-delivery.md

backend/
├── package.json
├── tsconfig.json
├── test/
│   ├── requests.integration-spec.ts
│   └── requests.persistence-spec.ts
└── src/
    ├── main.ts
    ├── app.module.ts
    └── requests/
        ├── requests.module.ts
        ├── requests.controller.ts
        ├── requests.service.ts
        ├── request-state-machine.service.ts
        ├── current-user.ts
        ├── dto/
        │   ├── create-request.dto.ts
        │   ├── assign-request.dto.ts
        │   └── update-status.dto.ts
        ├── entities/
        │   └── request.entity.ts
        ├── enums/
        │   └── request-status.enum.ts
        └── request-state-machine.service.spec.ts

frontend/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── playwright.config.ts
├── .env.example
├── e2e/
│   └── request-submission.spec.ts
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── api.ts
    ├── config.ts
    └── styles.css

```

TypeORM `synchronize` is enabled for this local SQLite slice only.
