import { API_URL, identityHeaders } from './config';

export type RequestRecord = {
  id: string;
  departmentId: string;
  requesterId: string;
  description: string;
  status: string;
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
    response = await fetch(`${API_URL}/requests`, {
      method: 'POST',
      headers: identityHeaders,
      body: JSON.stringify({ departmentId, description }),
    });
  } catch {
    throw new Error('The API is unreachable. Start the backend on port 3001 and try again.');
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(readErrorMessage(body));
  return body as RequestRecord;
}
