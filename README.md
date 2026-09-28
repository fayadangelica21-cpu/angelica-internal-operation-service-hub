# Internal Operations Service Hub

```text
Week 1 — Product specification, architecture, data model
Week 2 — Verified Open → In Progress → Resolved lifecycle
Week 3 — React + NestJS + SQLite product slice
Week 4 — Backend-controlled AI triage suggestion contract
```

```text
Current version
React + NestJS + SQLite service request hub
Firebase Authentication, role-based access, and AI-assisted triage
```

Employees submit and track internal service requests for IT, HR, or Finance. The backend owns validation, authorization, persistence, and lifecycle rules. AI-assisted triage suggests a likely department and next step before the employee submits a request.

```text
Open → In Progress → Resolved
```

---

## Current capabilities

- React form for submitting a request and AI-assisted triage workflow
- Responsive mobile layouts for Employee, Staff, and Admin workspaces, with touch-friendly controls and vertically stacked form inputs
- AI assistant UI for department suggestions, confidence scoring, and suggested next steps
- NestJS API with an explicit contract
- SQLite persistence through TypeORM
- Firebase-authenticated Staff can view active requests in their assigned department; the backend derives the department from the verified identity
- Staff can open a separate overdue view for overdue requests with deadlines in the previous seven days; older overdue requests are omitted from both Staff queue views
- Admins can assign or reassign a request to a Staff account in that request's department
- Admins can move an active request to another department; the request returns to the Open queue without its previous Staff owner
- Admins can monitor requests across IT, HR, and Finance, including current status and owner
- Admins can review active workload totals by department and assigned Staff member in a dedicated workload view; resolved requests are excluded
- Employees can view their own requests with a chronological status timeline and change timestamps; the backend scopes the list to the verified Firebase UID and omits internal actor IDs
- A red dot appears on **My requests** when one of the Employee's request statuses changes; opening the tab shows the refreshed request history and clears the indicator
- Backend-controlled AI triage step via `POST /triage` with a strict fixed JSON response contract
- AI payload is bounded to only the information needed for triage; the backend validates the response before showing it
- Authorization: an employee can create a request as themselves; another employee cannot read it (`403`)
- Department queue authorization tests ensure Staff cannot see other departments' requests and resolved requests are excluded
- Invalid input rejected on purpose (`400`)
- Missing request handled on purpose (`404`)
- Automated business-rule, integration, and E2E tests
- Regression protection for the forbidden `Open → Resolved` jump

Out of scope: company SSO, CI/CD, and production infrastructure. Firebase Authentication provides email/password sign-in for this project. The backend verifies Firebase ID tokens and makes every authorization decision.

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

If `AI_BASE_URL` and `AI_API_KEY` are not set, the backend still starts successfully and uses a deterministic local keyword fallback. It recognizes common IT device, software, sign-in, and network issues; HR topics such as onboarding, leave, and benefits; and Finance topics such as payroll, expenses, invoices, and purchasing. If both settings are present, the app uses the live AI provider.

Example backend `.env`:

```env
PORT=3001
DATABASE_PATH=data/service-hub.sqlite
AI_BASE_URL=https://router.requesty.ai/v1
AI_API_KEY=your-local-requesty-key
AI_MODEL=google/gemma-4-31b-it
```

`AI_MODEL` is just an example model name for local configuration; the app does not require this exact value to start, and missing AI configuration uses the deterministic local keyword fallback described below.

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

Employees can create accounts from the app. Create Staff/Admin accounts in Firebase, copy each account's UID, then add its UID, role, and (for Staff) department to backend `FIREBASE_ROLE_ASSIGNMENTS`. Staff accounts are added to the local SQLite user table when they sign in; Admins can assign requests to those registered Staff accounts in the same department.

For the Postman examples, set the `employeeIdToken` global to a current Firebase ID token for an Employee account. Obtain a fresh token after signing in; do not save evaluation passwords or long-lived tokens in the collection.

### Stop the project

The backend and frontend run in separate terminals.

Press Ctrl + C in each terminal to stop the corresponding process.

The SQLite database remains on disk at:

backend/data/service-hub.sqlite

---

## Grader access

Deployment is planned; the live URL will be added after deployment. The backend verifies Firebase ID tokens and enforces roles and department access on every request; the browser cannot assign its own role or department.

| Email | Evaluation password | Role | Department |
|---|---|---|---|
| admin@gmail.com | See submission email | Admin | — |
| it@gmail.com | See submission email | Staff | `DEPT-IT` |
| hr@gmail.com | See submission email | Staff | `DEPT-HR` |
| finance@gmail.com | See submission email | Staff | `DEPT-FINANCE` |
| nadoh@gmail.com | `p@ssw0rd` | Employee | — |
| angelicaf@gmail.com | `p@ssw0rd` | Employee | — |

Employees can also sign up from the app. Staff and Admin roles are assigned by Firebase UID in backend `FIREBASE_ROLE_ASSIGNMENTS`; sign in once with each Staff account so its profile is registered in the local SQLite database.

Sign in at `http://localhost:5173` with each evaluation account to view the Employee, Staff, and Admin workspaces. HR Staff should not see IT requests in the department queue.

### Allowed and denied checks (local)

Use `nadoh@gmail.com` as Employee 1 and `angelicaf@gmail.com` as Employee 2. Start the backend and frontend as described above.

To get an ID token, send this Firebase Authentication request once for each Employee. Get the Firebase web API key from `frontend/src/auth.tsx`, and substitute that Employee's password from the submission email:

```bash
curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<FIREBASE_WEB_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"nadoh@gmail.com","password":"<EMPLOYEE_1_PASSWORD>","returnSecureToken":true}'
```

Copy each response's `idToken` into the matching shell variable:

```bash
export EMPLOYEE_ID_TOKEN='<Employee 1 idToken>'
export OTHER_EMPLOYEE_ID_TOKEN='<Employee 2 idToken>'
export API_URL=http://localhost:3001
```

Keep these tokens private and use fresh tokens for each check.

**Allowed: Employee 1 creates a request (`201`)**

```bash
curl -i -X POST "$API_URL/requests" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $EMPLOYEE_ID_TOKEN" \
  -d '{"departmentId":"DEPT-IT","description":"Laptop screen flickers","expectedResolutionDate":"2027-12-31T17:30:00.000Z"}'
```

Copy the returned request `id` for the denied checks and set it here:

```bash
export REQUEST_ID='<created request id>'
```

**Denied: Employee 2 reads Employee 1's request (`403`)**

```bash
curl -i "$API_URL/requests/$REQUEST_ID" \
  -H "Authorization: Bearer $OTHER_EMPLOYEE_ID_TOKEN"
```

**Denied: HR Staff tries to assign the IT request (`403`)**

Repeat the sign-in request with `hr@gmail.com` and its password from the submission email. Set `HR_STAFF_ID_TOKEN` to the response's `idToken` and `HR_STAFF_FIREBASE_UID` to its `localId` value (the Firebase UID).

```bash
export HR_STAFF_ID_TOKEN='<HR Staff idToken>'
export HR_STAFF_FIREBASE_UID='<HR Staff localId>'
```

```bash
curl -i -X PATCH "$API_URL/requests/$REQUEST_ID/assign" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HR_STAFF_ID_TOKEN" \
  -d "{\"ownerId\":\"$HR_STAFF_FIREBASE_UID\"}"
```

The request was created for IT, so HR Staff must receive `403 Forbidden`.

**Bad login: the login screen shows a readable error**

On the sign-in screen, enter `nadoh@gmail.com` with a deliberately wrong password, such as `wrong-password-123`. The screen should display **“Invalid email or password”** instead of a raw Firebase error.

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
```

Roles and Staff department IDs come from backend `FIREBASE_ROLE_ASSIGNMENTS` configuration. `x-user-id`, `x-user-role`, and `x-user-department-id` headers are ignored.

### AI-assisted triage

For the live AI path, configure a local backend `.env` before starting the API:

```env
AI_BASE_URL=https://router.requesty.ai/v1
AI_API_KEY=your-local-requesty-key
AI_MODEL=google/gemma-4-31b-it
```

`AI_MODEL` is an example model name only; it is not the app's required default. If the AI configuration is missing, the backend uses its deterministic local keyword fallback. If a configured provider fails, the backend returns a controlled error.

The local fallback routes matching keywords to IT, HR, or Finance. Examples include device/software/network terms for IT, hiring/leave/benefits terms for HR, and payroll/expense/invoice terms for Finance. Short descriptions (under 20 characters after trimming) are marked `thin` and are not routed automatically.

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
  "description": "Laptop screen flickers",
  "expectedResolutionDate": "2027-12-31T17:30:00.000Z"
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
  "expectedResolutionDate": "2027-12-31T17:30:00.000Z",
  "createdAt": "...",
  "updatedAt": "..."
}
```

`departmentId` must be `DEPT-IT`, `DEPT-HR`, or `DEPT-FINANCE`. Description and at least one expected resolution value (date, time, or both) are required. Date-only means 11:59 PM on the chosen date; time-only means that time on the submission date. The frontend sends the resulting ISO timestamp, which is stored in UTC and displayed in local time. Employees see their own active requests past their deadline marked **Overdue** in red. Staff see a **Due soon** mark for requests in their department queue that are due within three hours. Admins see overdue requests in red across departments; **Manage assignment** is disabled for them, and active requests due within three hours trigger an in-app warning. Resolved requests trigger neither indicator.

### View your requests (Employee)

```http
GET /requests
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

The backend returns all requests belonging to the authenticated Employee, including resolved requests, ordered newest first. The requester ID is derived from the verified Firebase identity; caller-supplied IDs are ignored. Staff and Admin accounts receive `403 Forbidden` from this employee-only endpoint. The Employee page refreshes the list after submission, provides a refresh button, and checks for status changes in the background while the page is visible.

### View the department queue

```http
GET /requests/queue
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

This endpoint is for authenticated Staff accounts. The backend derives the department from the verified account and returns only that department's active `Open` and `In Progress` requests, newest first. The client cannot select or override the department. Employees, Admins, and Staff accounts without an assigned department receive `403 Forbidden`.

The regular queue omits overdue requests. Staff can view overdue requests whose expected resolution deadline fell within the previous seven days:

```http
GET /requests/queue/overdue
Authorization: Bearer <STAFF_FIREBASE_ID_TOKEN>
```

This Staff-only endpoint returns active overdue requests for the authenticated Staff member's department, newest update first. Requests overdue for more than seven days are omitted from this view. The Staff workspace provides **Weekly overdue** to open it and **Back** to return to the active queue.

### Read a request

```http
GET /requests/:id
Authorization: Bearer <FIREBASE_ID_TOKEN>
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

### Monitor requests across departments (Admin)

```http
GET /requests/admin
Authorization: Bearer <ADMIN_FIREBASE_ID_TOKEN>
```

This Admin-only endpoint returns requests across all departments, including resolved requests, ordered by most recently updated. The Admin workspace shows each request's department, status, owner, and timestamps; a department filter narrows the list while **All departments** shows the full view. The list has a manual refresh button and refreshes automatically while the page is visible. Employees and Staff receive `403 Forbidden`.

Admins can also review active workload summaries:

```http
GET /requests/admin/workload
Authorization: Bearer <ADMIN_FIREBASE_ID_TOKEN>
```

The response groups active `Open` and `In Progress` requests by department and assigned Staff member. Department totals also include unassigned requests; every registered Staff member is listed, including those with no active assignments. Resolved requests are excluded. Admins open the dedicated **View workload** screen from the all-requests page, where the department selector filters the summaries. Employees and Staff receive `403 Forbidden`.

### Assign a request (Admin)

Admins can look up an individual request by ID, then assign or reassign it to a Staff member in that request's department. The staff options come from local SQLite profiles created when Staff sign in. The backend enforces the role and same-department rules, regardless of the submitted owner ID.

```http
GET /requests/:id/assignees
Authorization: Bearer <ADMIN_FIREBASE_ID_TOKEN>
```

Returns eligible Staff profiles for that request's department. Admins can assign an unassigned `Open` request or reassign an `In Progress` request with `PATCH /requests/:id/assign` and `{ "ownerId": "<staff Firebase UID>" }`. Assigning an `Open` request moves it to `In Progress`; reassignment preserves its current status. Resolved requests cannot be assigned. Staff can still take ownership of an unassigned request through the same PATCH route, but cannot reassign an existing owner.

To correct a request routed to the wrong department, Admins can use `PATCH /requests/:id/department` with `{ "departmentId": "DEPT-HR" }`. The target department must be `DEPT-IT`, `DEPT-HR`, or `DEPT-FINANCE`, and must differ from the request's current department. Moving an active request clears its current Staff owner and returns it to `Open` in the destination department queue. Resolved requests cannot be moved. Employees and Staff receive `403 Forbidden`.

---

## Boundary checks (curl)

Backend must be running. These examples use Git Bash / macOS / Linux syntax. Set the base URL once; change this line when running against a deployed API:

```bash
export API_URL=http://localhost:3001
```

**Create (allowed)**

```bash
curl -X POST "$API_URL/requests" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $EMPLOYEE_ID_TOKEN" \
  -d '{"departmentId":"DEPT-IT","description":"Laptop screen flickers","expectedResolutionDate":"2027-12-31T17:30:00.000Z"}'
```

Expected: `201`, `status=Open`, the requested date persisted, and `requesterId` equal to the authenticated Firebase UID. Set `REQUEST_ID` to the returned `id`:

```bash
export REQUEST_ID='<created request id>'
```

**Invalid payload (rejected on purpose)**

```bash
curl -X POST "$API_URL/requests" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $EMPLOYEE_ID_TOKEN" \
  -d '{"departmentId":"DEPT-IT"}'
```

Expected: `400 Bad Request`.

**Missing resource (handled on purpose)**

```bash
curl "$API_URL/requests/not-a-real-request" \
  -H "Authorization: Bearer $EMPLOYEE_ID_TOKEN"
```

Expected: `404 Not Found`.

**Authorization denied**

Use Employee 1's request ID from the allowed create example, then:

```bash
curl "$API_URL/requests/$REQUEST_ID" \
  -H "Authorization: Bearer $OTHER_EMPLOYEE_ID_TOKEN"
```

Expected: `403 Forbidden`.

**Request lifecycle**

Get a Firebase ID token for `it@gmail.com` using the sign-in request in **Grader access**. Set `IT_STAFF_ID_TOKEN` to its `idToken` and `IT_STAFF_FIREBASE_UID` to its `localId`.

```bash
export IT_STAFF_ID_TOKEN='<IT Staff idToken>'
export IT_STAFF_FIREBASE_UID='<IT Staff localId>'
```

```bash
curl -X PATCH "$API_URL/requests/$REQUEST_ID/assign" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $IT_STAFF_ID_TOKEN" \
  -d "{\"ownerId\":\"$IT_STAFF_FIREBASE_UID\"}"
```

Expected: `200`, status `In Progress`.

```bash
curl -X PATCH "$API_URL/requests/$REQUEST_ID/status" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $IT_STAFF_ID_TOKEN" \
  -d '{"targetStatus":"Resolved"}'
```

Expected: `200`, status `Resolved`.

Direct `Open → Resolved` on a new request is still `400`.

---

### Windows note

The examples use Git Bash syntax.

If you are using PowerShell, use `Invoke-RestMethod` instead.

---

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
| `npm run test:integration` | SQLite persistence and HTTP authorization/validation boundaries, including required expected date-time validation and persistence, Employee-owned request lists, requester-only request details, same-department Staff detail and queue access, cross-department denial, Admin cross-department access and workload summaries, status-history timelines, Staff claim/resolve actions, and Admin assignment/department-reassignment rules. |
| `npm run test:ai-eval` | AI provider contract validation, expanded local keyword routing when provider configuration is missing, and controlled provider-failure handling. |
| `npm run test:all` | All backend tests |

### E2E

The FR8 E2E flow covers date-only, time-only, and combined date-and-time submission and verifies the resulting value appears in Employee request history. FR9 tests cover backend overdue/due-soon classification, the Staff queue's due-soon mark, the Admin warning and disabled assignment control, red overdue badges in Employee and Admin views, and exclusion of resolved requests.

Employee E2E coverage verifies that the **My requests** red dot appears after a status change and clears when the employee opens the request history.

```bash
cd frontend
npm install
npx playwright install
npm run test:e2e
```

The Playwright suite runs Vite in a dedicated E2E mode with a test-only identity adapter and mocked API responses; it does not create accounts in your Firebase project. It covers employee signup/login/logout, Employee-only history and role-based page visibility, request submission and the Employee-owned request list with refreshed statuses and a chronological status timeline, Staff processing a request from `Open` through `In Progress` to `Resolved`, and Admin monitoring requests across departments with department filtering, overdue and due-soon indicators, assigning/reassigning Staff, moving an active request to another department, and reviewing workload in the dedicated workload view. Mobile E2E checks cover Employee, Staff, and Admin layouts at 375px and 320px viewport widths, including horizontal overflow and key control sizing. HTTP and SQLite integration tests verify that request privacy rules, deadline classification, and Admin-only workload access hold server-side. Admin E2E coverage includes workload filtering, manual list refresh, opening a request with **Manage assignment**, and returning to the filtered list with **Back to requests**. It also verifies queue animation and ordering behavior. To try real Firebase accounts, start the backend and frontend normally after configuring Firebase as described above.

---

## Documentation

| Document | Purpose |
|---|---|
| `docs/product-spec.md` | Product problem, actors, requirements |
| `docs/architecture.md` | System structure and trust boundaries |
| `docs/data-model.md` | Durable facts and lifecycle rules |
| `docs/week2-agentic-workflow.md` | Request lifecycle design and verification notes |
| `docs/week3-full-stack-delivery.md` | Full-stack delivery history and implementation notes |
| `docs/week4-production-ai.md` | AI triage contract and provider integration notes |
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
│   │   │   │   ├── reassign-request-department.dto.ts
│   │   │   │   └── update-status.dto.ts
│   │   │   ├── entities/
│   │   │   │   ├── request-status-history.entity.ts
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
