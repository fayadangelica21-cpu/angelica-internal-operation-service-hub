# Week 2 Agentic Workflow & Lifecycle Verification

## Lifecycle States

- **Open**: Initial state upon request creation.
- **In Progress**: Active state following staff assignment or work start.
- **Resolved**: Terminal state upon completion.

## Required Transition Verification

The assignment requires two valid half-step transitions and one invalid full-path transition.

| Current State | Target State | Transition Type | Allowed? | Required Condition |
|---|---|---|---|---|
| Open | In Progress | Half-Step #1 | Yes | Staff assignment or active work start |
| In Progress | Resolved | Half-Step #2 | Yes | Resolution completed |
| Open | Resolved | Full-Path Jump | No | Direct jump is forbidden |

## Implementation Traceability

The lifecycle is enforced in the Backend API (FR4). Before applying a status change, the API checks the current status against the allowed transitions, so Open → Resolved is rejected and the status stays Open. See data model §5.1.