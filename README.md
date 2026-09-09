# Internal Operations Service Hub — Assignment 4

This repository contains the Assignment 4 bounded NestJS backend slice for the Internal Operations Service Hub.

The implementation focuses on the request lifecycle and strictly enforces the lifecycle defined by the Week 2 specification:

```text
Open → In Progress → Resolved
```

## Scope of this implementation

Implemented in this bounded slice:

- Create a request.
- Start every new request in `Open`.
- Assign an owner to an `Open` request and move it to `In Progress`.
- Move an `In Progress` request to `Resolved`.
- Reject direct lifecycle jumps.
- Reject reverse transitions and changes from the terminal `Resolved` state.
- Validate request and status input through DTO validation.
- Return a clear `404` when a request does not exist.

The wider Product Spec, Architecture, Data Model, and ADR describe the target system. Authentication/SSO, full authorization, notifications, status-history persistence, overdue detection, and a physical relational database are outside this bounded Assignment 4 implementation slice.

## Repository structure

```text
README.md

docs/
├── product-spec.md
├── architecture.md
├── data-model.md
├── decisions/
│   └── ADR-001-relational-database.md
└── week2-agentic-workflow.md

backend/
├── package.json
├── tsconfig.json
└── src/
    ├── main.ts
    ├── app.module.ts
    └── requests/
        ├── requests.module.ts
        ├── requests.controller.ts
        ├── requests.service.ts
        ├── request-state-machine.service.ts
        ├── dto/
        │   ├── create-request.dto.ts
        │   ├── assign-request.dto.ts
        │   └── update-status.dto.ts
        ├── entities/
        │   └── request.entity.ts
        └── enums/
            └── request-status.enum.ts
```

## Run

```bash
cd backend
npm install
npm run start:dev
```

The API runs on:

```text
http://localhost:3000
```

## Lifecycle verification

The assignment requires **two valid half-step transitions** and **one invalid full-path transition**.

### 1. Create a request — `Open`

```bash
curl -X POST http://localhost:3000/requests \
 -H "Content-Type: application/json" \
 -d '{"departmentId":"DEPT-IT","requesterId":"USR-123","description":"Laptop screen flicker"}'
```

The response should contain a new request whose status is `Open`.

Copy its returned `id` and use it as `<REQ_ID>` below.

### 2. Valid half-step #1: `Open → In Progress`

```bash
curl -X PATCH http://localhost:3000/requests/<REQ_ID>/assign \
 -H "Content-Type: application/json" \
 -d '{"ownerId":"STAFF-IT-01"}'
```

Expected: `200 OK`, with `ownerId` set and status changed to `In Progress`.

### 3. Valid half-step #2: `In Progress → Resolved`

```bash
curl -X PATCH http://localhost:3000/requests/<REQ_ID>/status \
 -H "Content-Type: application/json" \
 -d '{"targetStatus":"Resolved"}'
```

Expected: `200 OK`, with status changed to `Resolved`.

### 4. Invalid full-path transition: `Open → Resolved`

Create **another** request so that it remains in `Open`, then run:

```bash
curl -X PATCH http://localhost:3000/requests/<NEW_REQ_ID>/status \
 -H "Content-Type: application/json" \
 -d '{"targetStatus":"Resolved"}'
```

Expected: `400 Bad Request` because the direct full-path jump from `Open` to `Resolved` is forbidden.

### Required assignment result

| Transition | Result | Type |
|---|---|---|
| `Open → In Progress` | Allowed | Valid half-step #1 |
| `In Progress → Resolved` | Allowed | Valid half-step #2 |
| `Open → Resolved` | Rejected | Invalid full-path jump |

This is the **three-transition verification required by the assignment**.

## Strict state-machine rule

The lifecycle is enforced in one dedicated service:

```text
Open
  │
  └──→ In Progress
          │
          └──→ Resolved
```

Allowed transitions:

- `Open → In Progress` ✅
- `In Progress → Resolved` ✅

The direct full-path transition is rejected:

- `Open → Resolved` ❌

The implementation also treats `Resolved` as terminal, so it has no outgoing lifecycle transitions. This is an implementation safeguard and is **not an additional required verification case** for the assignment.

Assignment validates the `Open → In Progress` transition through the same state-machine service before changing the request state.

## Architecture/documentation boundary

The architecture and data model describe the full target Service Hub, including relational storage, authorization, history, notifications, overdue detection, and admin monitoring. Assignment 4 implements only the bounded request lifecycle slice; it does not claim those future/other components are already implemented.
