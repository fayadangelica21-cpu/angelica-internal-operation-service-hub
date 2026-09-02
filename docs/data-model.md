# Data Model: Internal Operations Service Hub

> **Status:** v0.1 — conceptual/logical data model, not a physical database schema.
>
> **Inputs:** `product-spec.md` + `architecture.md`.
>
> **Purpose:** define what the system must remember, how the durable information connects, which lifecycle and authorization rules the model must support, and how real product access patterns will find that information.

---

## 1. Modeling Principles

This model is derived from the product requirements and architecture rather than from implementation convenience.

1. **Store facts that must survive time.** A request, its department, requester, current owner, expected resolution date, and status history are durable facts.
2. **Do not store values that can be derived safely.** For example, `is_overdue` is a derived condition from the expected resolution date and the current time, so it does not need to be a separate durable fact.
3. **Keep ownership representable.** Every request must belong to exactly one department, while its staff owner may be absent until someone takes ownership.
4. **Keep history separate from current state.** The current request status answers “where is it now?”; status history answers “what happened before?”.
5. **Keep authorization data available to the backend.** User role and department are needed to enforce the server-side access rules defined by the architecture.
6. **Model departments as data, not a hardcoded enum.** IT, HR, and Finance exist at launch, but the product spec leaves future departments as an open question.

Traceability: SPEC1, SPEC2, SPEC4, SPEC6, SPEC9, FR1–FR11, NFR2–NFR3.

---

## 2. Domain Entities

### 2.1 User

Represents an internal company employee who interacts with the Service Hub.

**Important facts**
- `user_id` — stable identifier for the employee.
- `display_name` — name shown in the UI.
- `role` — Employee/Requester, Department Staff, or Admin/Manager.
- `department_id` — department associated with the user when applicable.
- Identity/authentication information is supplied by the external company Identity Provider; the Service Hub consumes the identity and relevant claims rather than implementing authentication itself.

**Why it exists**
- Requests need a requester.
- Staff ownership needs to identify a staff member.
- Server-side authorization needs the current user's role and department.

**Traceability:** FR1–FR6, FR10–FR11, NFR3, SPEC3, SPEC6, SPEC9.

---

### 2.2 Department

Represents an organizational support department.

**Important facts**
- `department_id` — stable identifier.
- `name` — department name.
- Launch values: IT, HR, Finance.

**Why it exists**
- Every request belongs to exactly one department.
- Department staff can only access their department's requests.
- Admins need a combined cross-department view.
- Keeping departments as data allows a future department to be added without changing the model itself.

**Traceability:** FR1, FR3, FR6, FR11, NFR3, SPEC1, SPEC2.

---

### 2.3 Request

The central business entity. It represents an employee's request for help from an internal department.

**Important facts**
- `request_id` — stable identifier.
- `requester_id` — employee who submitted the request.
- `department_id` — exactly one department responsible for the request.
- `description` — problem/request supplied by the employee.
- `status` — current lifecycle state, initially `Open`.
- `owner_id` — staff member currently responsible for the request; may be empty/unassigned.
- `expected_resolution_date` — optional date used to identify overdue requests.
- `created_at` — when the request was created.
- `updated_at` — when the current request record was last changed.

**Why it exists**
This entity supports submission, ownership, status, expected resolution, overdue monitoring, employee history, department queues, reassignment, and admin monitoring.

**Traceability:** FR1–FR11, SPEC2, SPEC4, SPEC8, NFR2–NFR3.

---

### 2.4 Request Status History

Represents an immutable record of a request's status changes over time.

**Important facts**
- `history_id` — stable identifier.
- `request_id` — request whose status changed.
- `from_status` — previous status, when one exists.
- `to_status` — new status.
- `changed_by_user_id` — actor who caused the transition.
- `changed_at` — time of the transition.

**Why it exists**
The product explicitly requires employees to view their complete request history. The architecture also separates current request state from historical information. Current `status` alone cannot reconstruct a reliable audit/history trail.

**Traceability:** FR4, FR9, FR10, NFR2, acceptance criteria in §9.

---

## 3. Relationships + Cardinality

| Relationship | Cardinality | Meaning | Rule |
|---|---:|---|---|
| User → Request (requester) | 1 → many | One employee may submit many requests | Every request has exactly one requester |
| Department → Request | 1 → many | A department receives many requests | Every request belongs to exactly one department |
| User → Request (owner) | 1 → many, optional on request | A staff member may own many requests | A request may start without an owner |
| Request → Request Status History | 1 → many | A request accumulates status changes | History belongs to exactly one request |
| User → Request Status History | 1 → many | A user can cause many transitions | Every transition records its actor |
| Department → User | 1 → many | Staff are associated with a department | Staff are pre-assigned; no self-selection |

### Key invariant

`Request.department_id` must contain **exactly one** department reference. The request cannot simultaneously belong to IT and HR, for example. If an employee selects the wrong department, an admin changes the request's department rather than creating a second request.

Traceability: SPEC2, FR5–FR6, edge case §10.

---

## 4. Ownership Model

Ownership has two distinct concepts and they must not be collapsed:

### Department ownership

Every request has exactly one `department_id`. This is mandatory because the product requires a request to belong to exactly one department.

### Staff ownership

`owner_id` identifies the staff member currently responsible for the request. It is **optional** because a request may initially be unassigned.

Therefore:

```text
Request
 ├── department_id   REQUIRED
 └── owner_id        OPTIONAL
```

A staff member may take ownership only when the request is in that staff member's department. An admin may assign/reassign a request to an appropriate staff member and may move the request to another department when it was submitted incorrectly.

Traceability: FR5–FR6, SPEC4, SPEC6, NFR3, architecture §3.1.

---

## 5. Lifecycle + Rules

### 5.1 Status lifecycle

The product examples define these states:

```text
Open → In Progress → Resolved
```

The model must preserve the current status on `Request` and each change in `Request Status History`.

### 5.2 Lifecycle rules

1. A newly submitted request starts as **Open**.
2. A request remains visible in the department queue while it is active.
3. Staff can update the request status.
4. When a request becomes **Resolved**, it moves out of the active queue and remains available in the employee's resolved history.
5. A status transition is recorded in status history.
6. A status change must be persisted before notification is treated as successful; notification is a side effect, not the source of truth.

Traceability: FR4, FR9–FR10, acceptance criteria §9; architecture §4.1.

### 5.3 Overdue rule

A request is overdue when:

```text
expected_resolution_date < current time
AND request is not yet resolved
```

`is_overdue` should be **derived**, not stored as an independent durable field, because the condition changes with time and can become stale.

Traceability: FR7–FR8, edge case §10, architecture §2.3.

### 5.4 Authorization-sensitive rules

Authorization is enforced by the Backend API, not by the frontend.

- **Employee:** can access only requests where `requester_id = current_user`.
- **Department Staff:** can access/update requests whose `department_id = current_user.department_id`.
- **Staff ownership:** a staff member can take ownership/update status only within their department.
- **Admin/Manager:** may view all departments and reassign requests.
- **Cross-department leakage:** a request must never appear in another department staff member's queue.

The data model therefore must retain requester, department, owner, and user role/department information needed for these checks.

Traceability: NFR3, FR3–FR6, FR11, edge case §10; architecture §3.1.

---

## 6. Durable vs Derived Data

| Information | Durable or derived? | Reason |
|---|---|---|
| Request ID | Durable | Stable identity of the request |
| Requester | Durable | Ownership/history and authorization fact |
| Department | Durable | Request's authoritative department |
| Description | Durable | Original business information |
| Current status | Durable | Current lifecycle state |
| Staff owner | Durable | Current responsibility |
| Expected resolution date | Durable | Business commitment used for overdue detection |
| Created/updated timestamps | Durable | Request timing and operational history |
| Status history | Durable | Required full request history |
| User role/department | Durable/authoritative from identity context | Needed for authorization decisions |
| `is_overdue` | **Derived** | Depends on current time + expected resolution date + current state |
| Department queue membership | **Derived** | Query of requests by department/status |
| Active vs resolved queue | **Derived** | Query of current status |
| Admin workload view | **Derived** | Aggregate of requests/owners/departments |

The model intentionally avoids duplicating these derived values as independent facts unless a later requirement proves that durable materialization is necessary.

---

## 7. Storage Decision

### Relational model

Use a **single relational database** as the conceptual storage direction.

This follows the architecture decision because:

- requests have clear relationships to users and departments;
- every request belongs to exactly one department;
- admin needs one combined view across all departments;
- request history has a clear parent-child relationship with requests;
- authorization filters depend on structured requester/department ownership;
- the product is a single-company system with only three departments at launch.

A document-oriented model is not necessary to satisfy the known requirements and would make the relational relationships and cross-department reporting less natural.

This is a storage **reasoning decision**, not a physical schema prescription. Table names, SQL types, foreign-key syntax, and exact indexes remain implementation work outside the current v0.1 scope.

Traceability: SPEC1–SPEC2, FR10–FR11, NFR3; architecture §4.2 and §5.

---

## 8. Access Patterns

Access patterns come from real product behavior, not from guessing indexes first.

### AP1 — Employee views own requests

```text
Find requests where requester_id = current_user
Optionally filter/order by current status or creation/update time.
```

Supports: FR2, FR10, NFR3.

### AP2 — Department staff views queue

```text
Find requests where department_id = current_staff.department
and the request is active.
```

Supports: FR3, NFR3.

### AP3 — Staff updates a request

```text
Load request by request_id
then verify department authorization before changing status/ownership.
```

Supports: FR4–FR5, NFR3.

### AP4 — Admin views all requests

```text
Find/aggregate requests across departments.
```

Supports: FR11.

### AP5 — Admin finds overdue requests

```text
Find requests whose expected_resolution_date is before now
and whose current status is not Resolved.
```

Supports: FR8.

### AP6 — Employee views complete history

```text
Find status-history records for one request, ordered chronologically.
```

Supports: FR10.

### AP7 — Admin monitors staff workload

```text
Aggregate active requests by owner_id, optionally grouped by department.
```

Supports: edge case §10 and the admin workload requirement.

### Index reasoning

At the physical implementation stage, indexes should be justified by these access patterns. The architecture identifies `department`, `requester_id`, `status`, and `expected_resolution_date` as likely useful indexed fields for the expected workload, but this document does not prescribe the final physical index design.

Traceability: architecture §3.2; FR2–FR3, FR8, FR10–FR11.

---

## 9. Traceability Matrix

| Requirement | Data-model support |
|---|---|
| FR1 Submit request | Request: requester, department, description, initial status |
| FR2 Own status | Request.requester + current status |
| FR3 Department queue | Request.department + current status |
| FR4 Update status | Request.status + Status History |
| FR5 Ownership/assignment | Request.owner_id |
| FR6 Department reassignment | Request.department_id can be changed by authorized admin |
| FR7 Expected date | Request.expected_resolution_date |
| FR8 Overdue detection | Derived from expected date + current status |
| FR9 Notifications | Status History/current status provides committed change for notification |
| FR10 Full history | Request Status History |
| FR11 Admin monitoring | Department relationship + request collection supports cross-department reads |
| NFR1 Browser access | Not a data-model concern; handled by architecture/client |
| NFR2 Few-second status reflection | Current status is directly persisted/read; synchronous DB path |
| NFR3 Privacy | Requester, department, owner + role/department context support server-side filters |
| NFR4 Simple UI | No unnecessary model complexity |
| SPEC1 | Department entity contains IT/HR/Finance at launch |
| SPEC2 | Exactly one department per Request |
| SPEC4 | Optional Request.owner_id |
| SPEC6 | User.department_id defines staff department |
| SPEC9 | User authorization context comes from known identity/role/department |

---

## 10. Deliberate Non-Model Decisions

The following are intentionally **not** modeled because the product specification marks them as unknowns or non-goals:

- File attachments — still an unknown.
- Priority — still an unknown.
- Employee/staff comments — still an unknown.
- Request cancellation — still an unknown.
- SLAs/escalation automation — explicitly out of scope.
- Payroll/benefits/HR records — explicitly out of scope.
- AI/chatbot data — explicitly out of scope.
- Email-created requests — explicitly out of scope.
- Multi-tenant organization data — explicitly out of scope.

The model should change only when a requirement or decision changes, not because a future feature is imagined.

Traceability: product-spec §6 and §8.

---

## 11. Open Questions That Affect the Model Later

The following product unknowns may require future model changes:

1. Will more departments be added?
2. Will requests support attachments?
3. Will requests have priority levels?
4. Will employees and staff exchange comments?
5. Can employees cancel requests?
6. Who sets the expected resolution date and at what point in the lifecycle?

These questions are deliberately recorded rather than silently answered in the v0.1 model.

---

## 12. Final Model Summary

```text
User ───────────────< Request >────────────── Department
  │                      │                        │
  │                      │                        │
  └───────< Status       └──── owner_id ─────────┘
            History

Request
 ├─ requester_id       → User
 ├─ department_id      → Department (required, exactly one)
 ├─ owner_id           → User (optional)
 ├─ description
 ├─ status             → current lifecycle state
 ├─ expected_resolution_date
 └─ timestamps

Request Status History
 ├─ request_id         → Request
 ├─ from_status
 ├─ to_status
 ├─ changed_by_user_id → User
 └─ changed_at
```

**Definition of done:** another engineer should be able to explain what the system remembers, how those facts connect, which lifecycle and authorization rules matter, which values are derived, why relational storage fits, and how real product queries access the data.
