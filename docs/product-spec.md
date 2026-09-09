# Product Spec: Internal Operations Service Hub

## Core problem
Employees need assistance from IT, HR, and Finance. Scattered email/chat/in-person requests create lost or delayed work, unclear ownership, inconsistent follow-up, and limited visibility.

## Actors
- Employee/Requester: submit requests, provide information, track status.
- Department Staff: receive/process/resolve requests for their department, take ownership, update status.
- Admin/Manager: oversee departments, monitor open/overdue work, view workload, assign/reassign.

## Functional requirements

- **FR1:** Submit a request with department and description.
- **FR2:** Employee views own request status.
- **FR3:** Staff views department requests.
- **FR4:** Staff updates status.
- **FR5:** Staff takes ownership; admins assign/reassign staff.
- **FR6:** Admin reassigns a request to the correct department.
- **FR7:** Request may have an expected resolution date.
- **FR8:** Admin identifies overdue requests.
- **FR9:** Employee is notified when status changes.
- **FR10:** Employee views complete request history.
- **FR11:** Admin monitors all requests.

## NFRs
- **NFR1:** Desktop/mobile browser access.
- **NFR2:** Status reflected within a few seconds.
- **NFR3:** Department privacy; server-side authorization.
- **NFR4:** Simple UI.

## Known constraints
- IT, HR, Finance at launch.
- Every request belongs to exactly one department.
- Internal employees only.
- Staff owner may initially be absent.
- Single company, not multi-tenant.
- Staff are pre-assigned to departments.
- Web only in v1; requests are created through Service Hub.
- Users are authenticated and role/department are known by the system.

## Unknowns / non-goals
Attachments, priority, comments, future departments, cancellation, and expected-date ownership remain open questions. SLAs/escalation, payroll/benefits data, AI/chatbots, email-created requests, and multi-tenancy are out of scope.
