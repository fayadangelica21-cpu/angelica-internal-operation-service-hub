# Architecture: Internal Operations Service Hub

**Firebase project implementation:** the prototype uses Firebase Authentication email/password for sign-up and sign-in. The frontend sends Firebase ID tokens to the API; the backend verifies them with Firebase Admin. The backend assigns roles and staff departments from the server-side Firebase UID mapping and upserts the verified profile in local SQLite. No password is stored in SQLite. This is the prototype identity implementation; company SSO/directory integration remains out of scope.

Architecture reasoning only — this document is a design draft, not an implementation.
Input: `product-spec.md`. Every decision below traces back to a Functional Requirement (FR),
Non-Functional Requirement (NFR), or Specification/Constraint (SPEC) ID from that document.

---

## 1. Purpose + Scope

### Purpose
The Internal Operations Service Hub centralizes employee requests to IT, HR, and Finance into
one trackable system, replacing scattered emails/chat/in-person asks, so every request has
clear ownership, status visibility, and no silent drops.

### Actors
| Actor | Core capability |
|---|---|
| Employee/Requester | Submit, track own requests |
| Department Staff (IT/HR/Finance) | View dept queue, own & update requests |
| Admin/Manager | Cross-department visibility, reassignment, overdue monitoring |

### System boundary
**In scope:** request lifecycle (Open → In Progress → Resolved), status notifications,
cross-department admin oversight, department-level data isolation, and backend-controlled AI triage
suggestions before final request submission. The AI step is a bounded recommendation layer that
returns a validated structured response and never mutates the final request record directly.
**Out of scope:** payroll/benefits data, SLA/escalation automation, email-based request
creation, and any AI action that bypasses backend validation (full exclusion list in Section 5).

### Functional Requirements
| ID | Requirement |
|---|---|
| FR1 | Employees submit a new request by selecting a department and describing the issue. |
| FR2 | Employees can request AI-assisted triage before final submission; the backend validates the response before showing it. |
| FR3 | Employees view the status of their own requests. |
| FR4 | Department staff view requests assigned to their department. |
| FR5 | Department staff update the status of requests. |
| FR6 | Staff take ownership; admins assign or reassign staff. |
| FR7 | Admins reassign a request to the correct department when it was submitted to the wrong one. |
| FR8 | Requests carry an expected resolution date. |
| FR9 | Admins identify overdue requests. |
| FR10 | Employees are notified when a request status changes. |
| FR11 | Employees view their full request history. |
| FR12 | Admins view and monitor all requests across departments. |
| FR13 | Each department's requests remain private and visible only to the relevant employee, authorized department staff, and authorized admins. |
| FR14 | Admins view workload across departments and staff members. |

### Non-Functional Requirements
| ID | Requirement |
|---|---|
| NFR1 | Desktop + mobile browser accessible |
| NFR2 | Status updates reflected within seconds |
| NFR3 | Simple UI, zero training needed |

### Specification / Constraints
| ID | Constraint |
|---|---|
| SPEC1 | 3 departments at launch (IT/HR/Finance) |
| SPEC2 | Each request → exactly one department |
| SPEC3 | Internal employees only |
| SPEC4 | Request may start unassigned to a staff member |
| SPEC5 | Single-company, not multi-tenant |
| SPEC6 | Staff pre-assigned to dept (no self-select) |
| SPEC7 | No native mobile app in v1 |
| SPEC8 | Requests created only via Service Hub |
| SPEC9 | Users pre-authenticated; role/dept known to system |

---

## 2. Structure + Flow

### 2.1 Components & Responsibilities
| Component | Responsibility | Traces to |
|---|---|---|
| Client (Web browser) | Renders UI for Employee/Staff/Admin roles; responsive layout | NFR1, NFR3 |
| Frontend App (SPA) | Renders request forms, queues, dashboards; role-based views | FR3, FR4, FR11, FR12, FR14, NFR3 |
| Backend API | Owns all business logic: create/assign/reassign/status-transition/overdue-detection; enforces access rules | FR1, FR5–FR9, FR12–FR14, SPEC2, SPEC4 |
| AI Triage Service | Receives a bounded issue description, suggests a likely department and next step, validates the model output, and returns only a backend-approved result; it does not mutate the final request record | FR1, FR2, FR13 |
| Identity Provider (SSO/Directory) *(external)* | Authenticates employee; supplies role + department claims | SPEC3, SPEC9 |
| Database | Persists requests, users, departments, status history | SPEC1, SPEC2, SPEC4, FR8 |
| Notification Service | Sends status-change alerts to employees | FR10 |

### 2.2 External Dependencies
- **Identity Provider / Company Directory** — spec assumes role/department are "known by the
  system" (SPEC9); this system consumes identity, it does not implement authentication.
- **Notification/email gateway** — outbound channel for FR10; part of the org's existing mail
  system, not built here.

No CRM and no separate department databases — the spec keeps this to a single internal system,
not integrated with existing HR/Finance software (Non-Goal: not replacing dedicated HR/Finance
systems).

### 2.3 Data Flows
1. **Submit request** (FR1) — Client → Frontend → Backend API → Database (write, status=Open) → Notification Service (confirmation)
2. **AI triage suggestion** (FR2) — Client → Frontend → Backend API → AI Triage Service (bounded prompt) → Backend validation → Frontend displays only the validated suggestion
3. **Status update** (FR5, FR10) — Staff via Frontend → Backend API → Database (write) → Notification Service → Employee notified
4. **Take ownership / reassign** (FR6, FR7) — Staff/Admin → Backend API → Database (write owner/department field)
5. **Overdue detection** (FR9) — Backend API (scheduled check) → Database (read `expected_resolution_date` < now) → flagged in Admin view
6. **Cross-department monitoring** (FR12) — Admin → Frontend → Backend API → Database (aggregate read across all departments, bypassing the FR13 isolation filter only for the Admin role)
7. **Workload monitoring** (FR14) — Admin → Frontend → Backend API → Database (aggregate read, grouped by staff/department) → displayed in Admin dashboard

### 2.4 Component diagram

```
Client (browser)
     │
     ▼
Frontend App (SPA) ── role-based views
     │
     ├── Auth ──────► Identity Provider (external SSO)
     │
     ├── Triage call ─► Backend API ── bounded prompt ─► AI Triage Service
     │                                                    │
     │                                                    └── validated JSON only ─► Frontend
     │
     └── API calls ─► Backend API ── business logic
                             │
                             ├── Write/read ─► Database ── requests, users, depts
                             │
                             └── Trigger ────► Notification Service ── status alerts
```

### 2.5 Failure modes — inside each component

| Component | Failure inside | How it's handled | Traces to |
|---|---|---|---|
| Client | Browser tab closes/crashes mid-submit | Draft not persisted client-side — resubmission required (documented gap, not silent loss) | NFR1 |
| Frontend app | JS bundle fails to load / stale cache | Fallback error screen, no partial UI state shown | NFR3 |
| Backend API | Business-rule crash (e.g. invalid state transition) | Request rejected with clear error; DB write never partially committed | FR5, SPEC2 |
| AI Triage Service | Provider outage or malformed model output | Provider call fails closed; backend returns a controlled rejection and never exposes untrusted AI text to the frontend | FR2, FR13 |
| Identity provider | SSO outage | Login blocked; no request can be created/viewed until restored — explicitly not solved locally | SPEC9 |
| Database | Write conflict / connection drop | Transaction rolled back; request stays in prior valid status, never half-updated | SPEC2, SPEC4 |
| Notification service | Delivery failure (mail gateway down) | Status change is already persisted and visible in-app; notification is best-effort, not a correctness dependency | FR10 |

### 2.6 Failure modes — between components

| Connection | Failure between | How it's handled | Traces to |
|---|---|---|---|
| Client ↔ Frontend | Network drop mid-session | Frontend detects disconnect, blocks further actions until reconnect | NFR1 |
| Frontend ↔ Identity provider | Auth timeout/token expiry | User redirected to re-auth; no action processed on a stale session | SPEC9 |
| Frontend ↔ Backend API | API unreachable or slow | Frontend surfaces a retry state; no optimistic UI update assumed | NFR2 |
| Backend API ↔ Database | DB unreachable | API returns failure to Frontend rather than assuming success; nothing queued silently | SPEC2 |
| Backend API ↔ AI Triage Service | Provider unavailable or malformed response | API rejects the result and returns a controlled error; no unvalidated free-form output reaches the UI | FR2, FR13 |
| Backend API ↔ Notification service | Notification call fails after DB commit | Status update already succeeded (source of truth); notification failure is logged/retried separately, never rolls back the status change | FR10 |
| Backend API ↔ Database | Two staff members take ownership of the same request at the same time. The ownership write only succeeds if the request is still unowned. The first write wins and the second is rejected with a clear message ("already taken by X"), and the Frontend refreshes the queue. No silent overwrite. | FR6, SPEC4 |

### 2.7 Requirement coverage (diagram → every FR)

The diagram in 2.4 is the architecture for the entire product, not one feature. All 14 FRs route
through the same 6 components — they differ only in which filter or field the Backend API
applies, not in which components they touch:

| FR | Path through the diagram |
|---|---|
| FR1 (submit request) | Client → Frontend → Backend API → Database (write) |
| FR2 (AI triage) | Client → Frontend → Backend API → AI Triage Service → Frontend (validated suggestion) |
| FR3 (employee views own status) | Client → Frontend → Backend API → Database (read, filtered by requester) |
| FR4 (staff views dept queue) | Client → Frontend → Backend API → Database (read, filtered by department) |
| FR5 (staff updates status) | Client → Frontend → Backend API → Database (write) → Notification |
| FR6 (ownership/assignment) | Client → Frontend → Backend API → Database (write owner field) |
| FR7 (reassign wrong dept) | Client → Frontend → Backend API → Database (write dept field) |
| FR8 (expected resolution date) | Client → Frontend → Backend API → Database (write) |
| FR9 (overdue detection) | Backend API (scheduled) → Database (read) — no new component |
| FR10 (notify on status change) | Backend API → Notification Service |
| FR11 (request history) | Client → Frontend → Backend API → Database (read, unfiltered by status) |
| FR12 (admin cross-dept view) | Client → Frontend → Backend API → Database (read, unfiltered by department) |
| FR13 (privacy/isolation) | Cross-cutting: enforced on every read path by the Backend API's role/department filter (see §3.1) |
| FR14 (workload monitoring) | Client → Frontend → Backend API → Database (aggregate read, grouped by dept/staff) |

This is a deliberate architectural property, not a coincidence: **one API, one database, one
notification path serve every feature through role/filter differences rather than separate
subsystems.** That's why the diagram stays at 6 boxes instead of growing per feature.

---

## 3. Trust + Resilience

### 3.1 Trust / Authorization boundaries
Traces to FR13 ("each department's requests must remain private") and the edge case
"Employee tries to access another employee's request." Every boundary is enforced
**server-side, in the Backend API** — never trusted to the Frontend.

| Boundary | Rule | Traces to |
|---|---|---|
| Employee → own requests only | API filters all reads/writes by `requester_id = current_user` | FR13, §10 edge case |
| Staff → own department only | API filters by `department = staff.department` (claim from SPEC9) | FR4, FR13, SPEC6 |
| Staff → ownership actions | Can take ownership/update status only within their own department | FR5, FR6 |
| Admin → all departments | Only role allowed to bypass the department filter, for reads and reassignment | FR7, FR12 |
| Cross-department leakage | An HR request must never appear in IT's queue, and vice versa | §9 acceptance criteria |
| Workload | Admin → workload data across all departments; only the Admin role may view aggregate staff/department workload | FR14 |

Role + department is the actual authorization key on every Backend API call — there is no
endpoint that returns unfiltered data; "admin" is a distinct authorization mode, not an
unfiltered default.

### 3.2 Realistic scalability / reliability notes
- **Scale**: single internal company, 3 departments at launch (SPEC1) — low-to-moderate traffic.
  A single relational database with standard indexing (`department`, `requester_id`, `status`,
  `expected_resolution_date`) is sufficient. No sharding, no microservices.
- **NFR2 ("within a few seconds")**: achievable via direct synchronous API calls, no queue
  required — see Decision in Section 4.1.
- **Availability**: no stated uptime SLA (correctly excluded — Non-Goal: no SLAs). System
  availability depends on Database and Identity Provider; redundancy for either is out of scope.
- **Growth**: Unknowns §6 flags future departments as open. `department` should be a lookup
  table, not a hardcoded enum — adding a 4th department becomes a data change, not a code change.

---

## 4. Decisions

### 4.1 Communication decisions (sync vs. async)
| Interaction | Sync or async | Why | Traces to |
|---|---|---|---|
| Client → Frontend → Backend API | Synchronous | User needs immediate confirmation before moving on | NFR2, FR1, FR5 |
| Backend API → Database | Synchronous | Correctness depends on the caller knowing immediately whether the write committed | SPEC2, SPEC4 |
| Backend API → Notification service | Asynchronous | Must never block or reverse a status update (fire-and-forget, retried/logged on failure) | FR10 |
| Overdue detection | Asynchronous (scheduled) | Not user-triggered — a periodic sweep, not a real-time push | FR9 |
| Frontend → Backend API → AI Triage Service | Synchronous | The employee needs the suggestion immediately before submission, but the backend still owns validation and trust | FR2 |

**Rule of thumb**: anything the user is waiting on to confirm their action succeeded is
synchronous; anything that's a side-effect of an already-committed fact is asynchronous. This is
why Notification sits outside the write path — a slow or failed mail gateway can never make a
successful update look like it failed.

### 4.2 Major decisions + rationale
| Decision | Rationale | Traces to |
|---|---|---|
| Single relational database, no per-department databases | SPEC2 (one dept per request) + FR12 (unified admin view); splitting would force fan-out queries at only 3 departments' scale | SPEC1, SPEC2, FR12 |
| Authorization enforced only in Backend API | FR13 and the unauthorized-access edge case are security requirements, not UX — Frontend-only filtering would leak data via direct API calls | FR13, §10 |
| AI triage is a bounded suggestion step, not a write path | FR2 explicitly keeps the AI as a pre-submission recommendation and requires backend validation before the frontend can show it | FR2, FR13 |
| No message queue / event bus | NFR2 only demands "a few seconds", and expected volume is low (single company, 3 departments); a queue adds complexity with no requirement that needs it | NFR2, SPEC1, SPEC5 |
| Identity/role/department consumed externally, not built | SPEC9 says users are already authenticated and role/department are known to the system, so building identity would duplicate what the company already has | SPEC3, SPEC9 |
| `department` as data, not a hardcoded enum | Unknowns §6 flags future growth; configurable data avoids a later migration | SPEC1, Unknowns §6 |
| Notification decoupled (async) from the status-write transaction | Resolves the Section 2.6 failure mode: notification failure must never cause a false failure or rollback | FR10 |
| Admin reassignment as a first-class write path | Both wrong-department reassignment and staff-overload rebalancing (§10) need the same underlying operation | FR6, FR7, §10, FR14 |

---

## 5. Out of Scope ("Not Yet")

- No code — frontend or backend
- No database schema (tables/collections/indexes) — only conceptual entities (Requests, Users, Departments) named in Section 2
- No detailed API endpoint definitions/contracts
- No CI/CD or production infrastructure
- No autonomous request creation from AI without human review
- No unnecessary microservices — single Backend API + single Database (Section 4 decision)
- No message queue/event pipeline — Section 4.1 communication is direct sync/async calls only
- No email/SSO implementation — Identity Provider and Notification gateway are external dependencies (Section 2.2)

**"Done" means:**
1. Major parts identified, and why each exists → Section 2.1
2. Inside vs. outside boundaries, and external dependencies → Sections 2.2, 3.1
3. How information moves, and where trust/auth checks matter → Sections 2.3, 3.1, 4.1
4. What happens when a dependency fails, and which spec requirement caused each decision → Sections 2.6, 4.2

