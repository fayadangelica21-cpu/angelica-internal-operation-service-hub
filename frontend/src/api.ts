import { getAuthToken } from './auth';
import { API_URL } from './config';

export type RequestRecord = {
  id: string;
  departmentId: string;
  requesterId: string;
  description: string;
  status: string;
};

export type TriageSuggestion = {
  draftId: string;
  departmentId: 'DEPT-IT' | 'DEPT-HR' | 'DEPT-FINANCE' | null;
  issueType: string;
  suggestedNextStep: string;
  confidence: number;
  requiresMoreInfo: boolean;
  classification: 'clear' | 'thin' | 'ambiguous' | 'unrelated';
  reasoning: string;
};

function readErrorMessage(body: unknown): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return 'Request could not be submitted.';
}

export async function createRequest(departmentId: string, description: string): Promise<RequestRecord> {
  let response: Response;
  try {
    const token = await getAuthToken();
    response = await fetch(`${API_URL}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ departmentId, description }),
    });
  } catch {
    throw new Error('The API is unreachable. Start the backend on port 3001 and try again.');
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(readErrorMessage(body));
  return body as RequestRecord;
}

export async function getDepartmentQueue(): Promise<RequestRecord[]> {
  let response: Response;
  try {
    const token = await getAuthToken();
    response = await fetch(`${API_URL}/requests/queue`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error('The API is unreachable. Start the backend on port 3001 and try again.');
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(readErrorMessage(body));
  if (!Array.isArray(body)) throw new Error('The department queue response was invalid.');
  return body as RequestRecord[];
}

export async function getTriageSuggestion(
  description: string,
  selectedDepartmentId?: string | null,
): Promise<TriageSuggestion> {
  let response: Response;
  try {
    const token = await getAuthToken();
    response = await fetch(`${API_URL}/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        description,
        selectedDepartmentId: selectedDepartmentId ?? null,
      }),
    });
  } catch {
    throw new Error('The AI triage service is unreachable. Start the backend and try again.');
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(readErrorMessage(body));
  return body as TriageSuggestion;
}
