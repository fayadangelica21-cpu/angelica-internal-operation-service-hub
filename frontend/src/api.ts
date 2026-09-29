import { getAuthToken } from './auth';
import { API_URL } from './config';
import { fetchWithWakeRetry } from './api-fetch';

export type RequestRecord = {
  id: string;
  departmentId: string;
  requesterId: string;
  description: string;
  status: string;
  ownerId?: string | null;
  ownerDisplayName?: string | null;
  expectedResolutionDate?: string | null;
  deadlineStatus?: 'overdue' | 'due-soon' | null;
  createdAt?: string;
  updatedAt?: string;
  statusHistory?: RequestStatusHistoryRecord[];
};

export type RequestStatusHistoryRecord = {
  historyId: string;
  fromStatus: string | null;
  toStatus: string;
  changedAt: string;
};

export type AssignableStaff = {
  id: string;
  email: string | null;
  displayName: string | null;
};

export type AdminWorkloadDepartment = {
  departmentId: string;
  activeRequestCount: number;
  openRequestCount: number;
  inProgressRequestCount: number;
  unassignedRequestCount: number;
};

export type AdminWorkloadStaff = {
  staffId: string;
  staffName: string;
  departmentId: string | null;
  activeRequestCount: number;
  openRequestCount: number;
  inProgressRequestCount: number;
};

export type AdminWorkloadSummary = {
  departments: AdminWorkloadDepartment[];
  staff: AdminWorkloadStaff[];
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

export async function createRequest(departmentId: string, description: string, expectedResolutionDate: string): Promise<RequestRecord> {
  let response: Response;
  try {
    const token = await getAuthToken();
    response = await fetchWithWakeRetry(`${API_URL}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ departmentId, description, expectedResolutionDate }),
    });
  } catch {
    throw new Error('The service is waking up or temporarily unavailable. Please try again.');
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(readErrorMessage(body));
  return body as RequestRecord;
}

export async function listOwnRequests(): Promise<RequestRecord[]> {
  let response: Response;
  try {
    const token = await getAuthToken();
    response = await fetchWithWakeRetry(`${API_URL}/requests`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error('The service is waking up or temporarily unavailable. Please try again.');
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(readErrorMessage(body));
  if (!Array.isArray(body)) throw new Error('Your request list response was invalid.');
  return body as RequestRecord[];
}

export async function getAllRequestsForAdmin(): Promise<RequestRecord[]> {
  const body = await getAuthenticatedJson<unknown>('/requests/admin', 'The Admin request list response was invalid.');
  if (!Array.isArray(body)) throw new Error('The Admin request list response was invalid.');
  return body as RequestRecord[];
}

export async function getAdminWorkload(): Promise<AdminWorkloadSummary> {
  const body = await getAuthenticatedJson<unknown>('/requests/admin/workload', 'The Admin workload response was invalid.');
  if (!body || typeof body !== 'object' || !Array.isArray((body as AdminWorkloadSummary).departments) || !Array.isArray((body as AdminWorkloadSummary).staff)) {
    throw new Error('The Admin workload response was invalid.');
  }
  return body as AdminWorkloadSummary;
}

export async function getDepartmentQueue(): Promise<RequestRecord[]> {
  let response: Response;
  try {
    const token = await getAuthToken();
    response = await fetchWithWakeRetry(`${API_URL}/requests/queue`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error('The service is waking up or temporarily unavailable. Please try again.');
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(readErrorMessage(body));
  if (!Array.isArray(body)) throw new Error('The department queue response was invalid.');
  return body as RequestRecord[];
}

export async function getDepartmentOverdueQueue(): Promise<RequestRecord[]> {
  const body = await getAuthenticatedJson<unknown>('/requests/queue/overdue', 'The overdue request list response was invalid.');
  if (!Array.isArray(body)) throw new Error('The overdue request list response was invalid.');
  return body as RequestRecord[];
}

async function getAuthenticatedJson<T>(path: string, errorMessage: string): Promise<T> {
  let response: Response;
  try {
    const token = await getAuthToken();
    response = await fetchWithWakeRetry(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error('The service is waking up or temporarily unavailable. Please try again.');
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(readErrorMessage(body));
  if (body === null || typeof body !== 'object') throw new Error(errorMessage);
  return body as T;
}

export function getRequestForAssignment(id: string): Promise<RequestRecord> {
  return getAuthenticatedJson<RequestRecord>(`/requests/${encodeURIComponent(id)}`, 'The request response was invalid.');
}

export async function getAssignableStaff(requestId: string): Promise<AssignableStaff[]> {
  const body = await getAuthenticatedJson<unknown>(
    `/requests/${encodeURIComponent(requestId)}/assignees`,
    'The staff list response was invalid.',
  );
  if (!Array.isArray(body)) throw new Error('The staff list response was invalid.');
  return body as AssignableStaff[];
}

async function patchRequest(id: string, action: 'assign' | 'status' | 'department', payload: object): Promise<RequestRecord> {
  let response: Response;
  try {
    const token = await getAuthToken();
    response = await fetchWithWakeRetry(`${API_URL}/requests/${encodeURIComponent(id)}/${action}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('The service is waking up or temporarily unavailable. Please try again.');
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(readErrorMessage(body));
  return body as RequestRecord;
}

export function takeOwnership(id: string, ownerId: string): Promise<RequestRecord> {
  return patchRequest(id, 'assign', { ownerId });
}

export function assignRequestToStaff(id: string, ownerId: string): Promise<RequestRecord> {
  return patchRequest(id, 'assign', { ownerId });
}

export function reassignRequestDepartment(id: string, departmentId: string): Promise<RequestRecord> {
  return patchRequest(id, 'department', { departmentId });
}

export function resolveRequest(id: string): Promise<RequestRecord> {
  return patchRequest(id, 'status', { targetStatus: 'Resolved' });
}

export async function getTriageSuggestion(
  description: string,
  selectedDepartmentId?: string | null,
): Promise<TriageSuggestion> {
  let response: Response;
  try {
    const token = await getAuthToken();
    response = await fetchWithWakeRetry(`${API_URL}/triage`, {
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
