# Week 3 — Full-Stack Delivery: v0.3 Integrated Product Slice

## 1. Delivery claim

> **Authentication update:** the Week 3 sections below describe the original development identity adapter and header-based examples. The current project has replaced that adapter with Firebase Authentication; see the README and architecture document for the current token, role-mapping, and SQLite profile flow.

This Week 3 delivery turns the existing Week 2 lifecycle slice into one narrow **user-facing, integrated, persistent, permission-aware, validated, failure-aware, automatically verified** flow.

**Flow:** an Employee submits an internal service request for IT, HR, or Finance and immediately receives the newly created request in the `Open` state.

The same repository now contains:

- React frontend
- NestJS backend
- SQLite relational database persistence
- explicit HTTP request/response contract
- server-side authorization checks
- intentional validation rejection
- intentional expected-failure handling
- automated business-rule and regression tests
- backend ↔ database integration test
- browser E2E test

The slice remains deliberately narrow. It does **not** attempt to implement the entire Service Hub.

---

# 2. Build → Protect → Automate

## BUILD THE SLICE

### User-facing flow

```text
Employee
   ↓
React form
   ↓ POST /requests
NestJS API
   ↓
SQLite database
   ↓
201/created request
   ↓
React shows request + Open status
```

The employee selects a department and enters a description. The frontend sends the request to the backend. The backend creates the authoritative request record and persists it. The response is displayed to the user.

### Why this slice?

It is a complete vertical slice rather than a collection of disconnected files:

```text
one user action
→ one frontend interaction
→ one API contract
→ one backend behavior
→ one durable database write
→ one user-visible result
```

This directly traces to **FR1** in the product specification: employees can submit a new request by selecting a department and describing the issue.

### Real persistence

Week 2 used an in-memory `Map`, so data disappeared when the backend restarted. Week 3 replaces that implementation with TypeORM + SQLite.

The database stores the authoritative request facts:

- request ID
- department ID
- requester ID
- description
- current status
- owner ID
- created/updated timestamps

The database path defaults to:

```text
backend/data/service-hub.sqlite
```

The persistence layer is deliberately small, but it is real durable storage rather than process memory.

---

# 3. Explicit API contract

The API contract is explicit so the frontend does not need to guess what to send or receive.

## Identity context for local development

The product architecture says the company Identity Provider supplies identity, role, and department claims. Week 3 does **not** build SSO because the assignment does not require an external integration.

For local development and tests, a small development identity adapter supplies the already-known identity context using request headers:

```text
x-user-id: EMP-001
x-user-role: Employee | Staff | Admin
x-user-department-id: DEPT-IT     (required for Staff)
```

These headers are **not presented as production authentication**. They simulate the identity context that the external company Identity Provider would supply. Authorization is still enforced on the server, which preserves the architectural boundary required by FR12 and SPEC9.

## Create request

### Request

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

### Successful response

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

Important boundary: `requesterId` is **not accepted from the client body**. The backend derives it from the current identity context. A client therefore cannot create a request while claiming to be another employee.

## Read one request

```text
GET /requests/:id
```

The backend returns:

- `200` when the request exists and the caller is authorized.
- `403` when the caller exists but is not allowed to access that request.
- `404` when the request does not exist.

## Existing Week 2 lifecycle endpoints

```text
PATCH /requests/:id/assign   Open → In Progress (sets owner)
PATCH /requests/:id/status   In Progress → Resolved only
```

Starting work through `PATCH /status` is rejected. Assignment is the path that moves a request to `In Progress`.

The existing lifecycle remains:

```text
Open → In Progress → Resolved
```

---

# 4. Protect the boundaries

The frontend is not trusted as an authorization boundary. The backend makes the final decision.

## Meaningful authorization rule

### Allowed case

An Employee may create a request as themselves.

```text
Current identity: EMP-001 / Employee
POST /requests
→ requesterId persisted as EMP-001
→ allowed
```

### Denied case

An Employee may read only their own request.

```text
Request.requesterId = EMP-001
Current identity = EMP-002 / Employee
GET /requests/:id
→ 403 Forbidden
```

The same service also enforces the architecture's staff boundary:

- staff can access requests only in their own department;
- staff can take ownership/update status only in their own department; a staff member cannot claim ownership for another staff identity;
- admin can access all requests.

## Validation: one invalid request rejected intentionally

A create request without a description is invalid.

```http
POST /requests

{
  "departmentId": "DEPT-IT"
}
```

NestJS DTO validation rejects it with `400 Bad Request` before the service writes anything to the database.

Validation also restricts departments in this launch slice to:

```text
DEPT-IT
DEPT-HR
DEPT-FINANCE
```

## Business rule protection

The lifecycle state machine remains the authoritative business-rule boundary:

```text
Open → In Progress       allowed
In Progress → Resolved   allowed
Open → Resolved          rejected
Resolved → anything      rejected
```

A direct `Open → Resolved` jump is rejected intentionally rather than silently accepted.

## Expected failure handled intentionally

A request ID may be valid syntactically but not exist in the database.

```text
GET /requests/not-a-real-id
→ 404 Not Found
```

The backend handles this expected failure explicitly with `NotFoundException`. It does not return fake data or report success.

---

# 5. Automate confidence

Manual checking was useful while building, but the important claims now have repeatable evidence.

## A. Automated business-rule test

`backend/src/requests/request-state-machine.service.spec.ts`

Verifies:

- `Open → In Progress` is allowed.
- `In Progress → Resolved` is allowed.

This tests the lifecycle rule itself without needing the frontend or database.

## B. Regression protection

The same unit test explicitly protects Week 2 behavior that already worked:

```text
Open → Resolved must continue to be rejected.
```

This is regression protection. If a future change accidentally permits the direct jump, the test fails.

## C. Backend ↔ database integration test

`backend/test/requests-db.integration.spec.ts`

The test uses a real SQLite database engine in memory and verifies the full backend persistence boundary:

```text
RequestsService
   ↓ save
SQLite
   ↓ read repository directly
assert durable row values
```

It proves more than an in-memory service assertion: the request is written through the repository and can be read back from the database.

## D. Meaningful E2E test

`frontend/e2e/request-flow.spec.ts`

The browser test performs the actual user-facing flow:

1. opens the React application;
2. selects IT;
3. enters a description;
4. clicks **Submit request**;
5. receives the successful API response and verifies the resulting user-visible state;
6. verifies that the user sees **Request submitted** and status **Open**.

This is meaningful because it follows the user action across the frontend and API boundary rather than testing an isolated function.

---

# 6. Evidence matrix

| Week 3 requirement | Evidence |
|---|---|
| React frontend | `frontend/src/main.tsx` |
| NestJS backend | `backend/src/...` |
| Real database persistence | TypeORM + SQLite in `AppModule` and `RequestEntity` |
| Explicit API contract | this document, §3 |
| Authorization allowed | Employee submit path; backend service checks |
| Authorization denied | Employee cannot read another employee's request; `403` |
| Invalid request rejected | DTO validation returns `400` |
| Expected failure handled | missing request returns `404` |
| Automated business-rule test | state-machine spec |
| Backend/database integration test | `requests-db.integration.spec.ts` |
| Meaningful E2E test | Playwright request flow |
| Regression protection | direct `Open → Resolved` rejection test |

---

# 7. External integration decision

**No external integration is added for Week 3.**

The architecture describes an external company Identity Provider and a Notification Service. However, the assignment explicitly says an external integration is not automatically required.

The product design says the Service Hub **consumes** identity rather than implementing authentication. For this local integrated slice, a development identity adapter represents the already-known role/department context so that authorization can be tested without inventing a new SSO dependency.

Notification is also not part of this narrow flow. The architecture remains the source for the future integration direction.

Therefore this delivery intentionally does **not** add:

- runtime AI
- RAG
- MCP
- CI/CD
- deployment
- production infrastructure
- monitoring
- real SSO implementation
- notification gateway implementation

These omissions are deliberate scope control, not missing requirements for this Week 3 slice.

---

# 8. Final Week 3 statement

```text
BUILD THE SLICE
        ↓
PROTECT THE BOUNDARIES
        ↓
AUTOMATE CONFIDENCE
```

The delivered slice is:

- **USER-FACING** — a React user submits a request.
- **INTEGRATED** — React communicates with NestJS through an explicit HTTP contract.
- **PERSISTENT** — NestJS stores the request in SQLite.
- **PERMISSION-AWARE** — backend authorization checks role, requester ownership, and department.
- **VALIDATED** — invalid input is rejected before persistence.
- **FAILURE-AWARE** — expected missing-resource failure is returned as `404`.
- **AUTOMATICALLY VERIFIED** — business, regression, integration, and E2E evidence exist.

> AI helped build faster. Engineering confidence came from the claims, boundaries, and evidence we chose to own.
