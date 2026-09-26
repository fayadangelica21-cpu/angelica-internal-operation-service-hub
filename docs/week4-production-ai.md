# Week 4 AI Triage Feature

## Goal

Add a backend-controlled AI triage suggestion before an employee submits a final request. The AI is advisory only and never creates or mutates the final request record. The backend owns the contract, validation, and safe output shape.

## Product rule

The AI only receives a bounded context. It does not receive request IDs, status fields, timestamps, or unrelated database values that are not needed for triage.

## Business rules: what is needed vs what is not

### Needed by the business rules

The AI may receive only the fields that directly support triage classification and routing:

- description
  - the employee's issue text
- selectedDepartmentId
  - optional, only when the user already chose a department
- allowedDepartments
  - fixed list: DEPT-IT, DEPT-HR, DEPT-FINANCE
- productContext
  - short instructions about the service hub and the triage task
- outputContract
  - strict instruction to return only the backend-defined JSON object

### Not needed by the business rules

The AI should not receive any of the following:

- requesterId
- requesterRole
- request_id
- owner_id
- status
- created_at
- updated_at
- user profile details
- internal DB identifiers
- unneeded metadata
- unrelated free-form text

This keeps the AI bounded and prevents unneeded exposure.

## AI request payload

The backend sends the following payload to the AI provider:

```json
{
  "description": "My laptop screen flickers and the battery drains quickly",
  "selectedDepartmentId": "DEPT-IT",
  "allowedDepartments": ["DEPT-IT", "DEPT-HR", "DEPT-FINANCE"],
  "productContext": "This is an internal operations support system for IT, HR, and Finance requests. The AI helps triage the issue before the employee submits the final request.",
  "outputContract": "Return strict JSON only. The keys and enum values must match the backend contract exactly."
}
```

## Fixed backend-owned response contract

The response from the AI must be a strict JSON object matching this structure:

```ts
{
  draftId: string;
  departmentId: 'DEPT-IT' | 'DEPT-HR' | 'DEPT-FINANCE' | null;
  issueType: 'hardware' | 'software' | 'access' | 'hr_policy' | 'payroll' | 'finance' | 'general';
  suggestedNextStep: string;
  confidence: number; // 0.0 to 1.0
  requiresMoreInfo: boolean;
  classification: 'clear' | 'thin' | 'ambiguous' | 'unrelated';
  reasoning: string;
}
```

Example:

```json
{
  "draftId": "triage_123456789",
  "departmentId": "DEPT-IT",
  "issueType": "hardware",
  "suggestedNextStep": "Ask the employee whether the issue affects the display, battery, or docking equipment before routing to IT support.",
  "confidence": 0.92,
  "requiresMoreInfo": false,
  "classification": "clear",
  "reasoning": "The description clearly matches a laptop hardware problem and a likely IT triage path."
}
```

## Allowed departments

- DEPT-IT
- DEPT-HR
- DEPT-FINANCE

## Allowed issue types

- hardware
- software
- access
- hr_policy
- payroll
- finance
- general

## Allowed classifications

- clear
- thin
- ambiguous
- unrelated

## Safety and validation rules

The backend must reject any AI output that does not match the fixed contract.

Reject any response that:

- contains unexpected keys
- uses an unapproved issueType
- uses an invalid departmentId
- has confidence outside the range 0.0 to 1.0
- has missing or empty strings in required fields
- returns a non-JSON payload
- returns provider error text instead of structured data

The AI must never invent arbitrary values such as:

- "computer issue"
- "urgent"
- "misc"
- "something else"

These must be rejected by the backend.

## Endpoint contract

### Request

```http
POST /triage
Content-Type: application/json
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

```json
{
  "description": "Laptop screen flickers",
  "selectedDepartmentId": "DEPT-IT"
}
```

### Response

```json
{
  "draftId": "triage_123456789",
  "departmentId": "DEPT-IT",
  "issueType": "hardware",
  "suggestedNextStep": "Ask the employee whether the issue affects the display, battery, or docking equipment before routing to IT support.",
  "confidence": 0.92,
  "requiresMoreInfo": false,
  "classification": "clear",
  "reasoning": "The description clearly matches a laptop hardware problem and a likely IT triage path."
}
```

## Provider configuration

Local backend environment variables for the live AI provider:

```bash
AI_BASE_URL=https://router.requesty.ai/v1
AI_API_KEY=your-key
AI_MODEL=google/gemma-4-31b-it
```

The backend appends `/chat/completions` itself, so `AI_BASE_URL` must be the base URL only, not the full chat-completions URL. The configured model can be any valid Requesty model string you want to route through; the example uses `google/gemma-4-31b-it`.

If these are not configured, the backend uses a safe deterministic fallback response that still preserves the fixed JSON shape and validation rules.

## Curl example

```bash
curl -X POST http://localhost:3001/triage \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -d '{"description":"Laptop screen flickers","selectedDepartmentId":"DEPT-IT"}'
```

## Testing coverage

The backend test suite covers the main risk scenarios:

- clear issue happy path
- thin input
- ambiguous input
- unrelated input
- trusted context / conditional behavior
- invalid AI output shape
- provider failure / service unavailable

## Design principle

The backend owns the AI contract. The model is not trusted with raw business data or with free-form output. The frontend only receives the validated result from the backend.
