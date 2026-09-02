# ADR-001: Use a Single Relational Database

- **Status:** Accepted
- **Date:** 2026-09-01
- **Decision owners:** Internal Operations Service Hub team

## Context

The Internal Operations Service Hub is a single-company internal system serving three departments at launch: IT, HR, and Finance.

The product requires:

- every request to belong to exactly one department;
- every request to have one requester;
- a request to optionally have one staff owner;
- staff to see their department's queue;
- employees to see their own requests and complete request history;
- admins to view and monitor all departments in one combined view;
- request status history to be retained;
- server-side authorization based on the employee's role and department.

The architecture also identifies low-to-moderate expected traffic and explicitly rejects unnecessary microservices and per-department databases.

## Decision

Use **one relational database** as the storage model for the Service Hub.

The conceptual domain is represented through related entities:

- User
- Department
- Request
- Request Status History

The exact physical tables, SQL types, constraints, and final indexes are implementation details and are intentionally outside v0.1.

## Why

### 1. The domain has strong relationships

A Request has a requester, exactly one department, and an optional staff owner. Status history belongs to a request and records the user who changed it. These relationships are naturally represented in a relational model.

### 2. The system needs unified cross-department reads

FR11 requires an admin to monitor all requests across IT, HR, and Finance. Separate department databases would require fan-out queries and aggregation across stores for a feature that is explicitly supposed to have one combined view.

### 3. Authorization depends on structured ownership

Department privacy is enforced by the Backend API using requester and department information. Keeping these relationships explicit makes the authorization predicates straightforward:

```text
employee → requester_id = current_user
staff    → department_id = current_user.department
admin    → cross-department access
```

### 4. The current scale does not justify distributed storage

The known scope is a single company and three departments at launch. There is no requirement for sharding, multiple databases, or a distributed event-driven storage architecture.

### 5. Future departments should be data, not code

Department is modeled as an entity rather than a hardcoded enum. If a fourth department is introduced later, the domain model can accommodate it as data.

## Alternatives Considered

### Document database

**Rejected for v0.1.** A document model could store request-shaped data, but the known requirements rely on several stable relationships and cross-department querying. The relational model communicates these relationships more directly and supports the current access patterns without adding complexity.

### Separate database per department

**Rejected.** It conflicts with the need for an admin combined view and creates unnecessary fan-out/aggregation work at the current scale.

### Multiple services/databases

**Rejected.** The architecture deliberately uses one Backend API and one Database. The product requirements do not justify distributed complexity.

## Consequences

### Positive

- Clear relationships between users, departments, requests, and history.
- Straightforward department/requester filtering for authorization.
- Natural support for the admin cross-department view.
- One source of truth for request state.
- Easier transactional consistency for request status and ownership changes.

### Negative / Trade-offs

- The relational schema will need to evolve if future requirements introduce highly variable structures such as attachments or comments.
- Physical indexing must be designed from measured access patterns rather than assumed in advance.
- Database availability remains a dependency of the system; redundancy is outside the current scope.

## Traceability

- **SPEC1:** three departments at launch.
- **SPEC2:** exactly one department per request.
- **SPEC4:** requests may be initially unassigned to staff.
- **FR2–FR6:** requester, department, status, and owner relationships.
- **FR10:** request status history.
- **FR11:** unified cross-department admin view.
- **NFR3:** department-level privacy/isolation.
- **Architecture §3.2:** relational database and expected indexes are sufficient for current scale.
- **Architecture §4.2:** explicit decision for a single relational database and no per-department databases.
