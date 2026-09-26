# Product Spec: Internal Operations Service Hub

## 1. Problem / Context
Employees frequently need assistance from internal departments such as IT, HR, and Finance, 
but these requests are currently handled through scattered emails, chat messages, and informal in-person conversations. 
There is no centralized system to submit requests, track their progress, or clearly assign responsibility for resolving them.
This leads to lost or delayed requests, unclear ownership, inconsistent follow-up, and limited visibility for both employees and support departments.

## 2. Actors / Stakeholders
- **Employee/Requester** – people who need help. They can submit a request, provide the necessary information, and track its status.
- **Department Staff** (IT, HR, Finance) – receive, process, and resolve requests assigned to their department. They can view request details, take ownership of requests, update their status, and resolve them.
- **Admin/Manager** – oversees requests across all departments. They can monitor open and overdue requests, view workload across departments and staff, reassign requests when necessary

## 3. Functional Requirements
1. Employees can submit a new request by selecting a department and describing the issue.
2. Employees can request an AI-assisted triage step before final submission. The AI suggests a likely department and next step based only on the issue description and a minimal bounded context, and the backend validates each response before showing it to the employee.
3. Employees can view the status of their own requests (e.g., Open, In Progress, Resolved).
4. Department staff can view requests assigned to their department.
5. Department staff can update the status of a request.
6. Department staff can take ownership of requests, and admins can assign or reassign requests to appropriate staff members.
7. Admins can reassign a request to a different department when it has been submitted to the wrong department.
8. Requests can have an expected resolution date.
9. Admins can identify requests that have passed their expected resolution date.
10. Employees are notified when the status of their request changes.
11. Employees can view their complete request history.
12. Admins can view and monitor all requests across all departments.
13. Each department's requests must remain private and visible only to the relevant employee, authorized department staff, and authorized admins.
14. Admins can view workload across departments and staff members.

## 4. Non-Functional Requirements
- The system must be accessible from both desktop and mobile browsers.
- Status updates must be reflected within a few seconds of being made.
- The interface should be simple and require no training to use.

## 5. Known Facts
- Three departments exist at launch: IT, HR, Finance.
- Every request belongs to exactly one department.
- Users are internal company employees only (no external users).
- Every request is assigned to exactly one department and may initially be unassigned to a specific staff member until someone takes ownership.
- Requests can have an expected resolution date used to identify overdue requests.

## 6. Unknowns
- Do requests need file attachments (e.g. screenshots, documents)?
- Is there a need for priority levels (urgent vs. normal)?
- Should employees be able to comment back and forth with staff on a request?
- Will more departments be added later?
- should employees be able to cancel a request after submitting it?
- Who sets the expected resolution date, and when should it be assigned?

## 7. Assumptions / Constraints
- Assuming single-company, internal use only (not multi-tenant, not for external customers).
- Assuming department staff are pre-assigned to their department (no self-selection).
- The system will be accessed through desktop and mobile web browsers; native mobile apps are not included in the initial version.
- Requests must be created through the Service Hub rather than by sending an email.
- Users are authenticated company employees, and their role and department are known by the system.

**Prototype implementation note:** the current demo uses Firebase email/password authentication, permits Employee self-sign-up, and assigns Staff/Admin roles from a server-side Firebase UID map. Signup does not verify that a person is a company employee, so it demonstrates authentication and role gating but does not yet satisfy the internal-employee identity assumption for production use.

## 8. Non-Goals (What We're Deliberately Not Solving)
- Not building a full ticketing system with SLAs, escalation rules, or automated routing.
- Not replacing existing dedicated HR or Finance software systems.
- Not handling payroll, benefits, or any HR data beyond the request itself.
- Not allowing the AI to create, mutate, or route a final request without backend validation.
- Not persisting the AI triage suggestion as the source of truth for the final request; it is only a pre-submission recommendation.
- Not supporting request creation through email, chat, or other informal channels in the initial version.

## 9. Acceptance Criteria (Examples of Correct Behavior)
- An employee submits an IT request → it appears as "Open" in their history and in IT's queue.
- IT staff changes the status to "In Progress" → the employee sees the updated status and gets notified.
- IT staff marks it "Resolved" → it moves out of the active queue and into the employee's resolved history.
- An HR request never appears in the IT staff's queue, and vice versa.
- An admin can see all three departments' requests in one combined view.
- An employee enters a request description and requests AI triage → the backend returns a strict structured JSON suggestion with a fixed department and issue type, and the employee can review it before submitting the actual request.
- If the AI returns an invalid shape or provider failure occurs → the backend rejects it and does not pass untrusted data to the frontend.

## 10. Error / Edge Cases & Bad Scenarios
- Employee selects the wrong department – The request should not be lost. An admin can reassign it to the correct department, and the employee can see the updated department/status.
- Request has no assigned staff member – The request remains visible in the department queue. If it passes its expected resolution date, it is marked as overdue and can be assigned or reassigned by an admin.
- Staff member is overloaded – An admin can monitor staff workload and reassign a request to another appropriate staff member.
- Employee tries to access another employee's request – Access is denied, and the employee can only view their own requests.
