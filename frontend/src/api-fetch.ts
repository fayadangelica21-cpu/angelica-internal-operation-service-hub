const MAX_WAKE_RETRIES = 12;
const RETRY_DELAY_MS = import.meta.env.MODE === 'e2e' ? 300 : 5000;

function notifyServerWaking(waking: boolean): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('service-hub-server-waking', { detail: waking }));
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retry safe reads while Render is waking from idle; never replay writes. */
export async function fetchWithWakeRetry(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const retryable = ['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase());
  const retries = retryable ? MAX_WAKE_RETRIES : 0;
  let waking = false;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const slowRequestTimer = retryable
      ? setTimeout(() => {
          waking = true;
          notifyServerWaking(true);
        }, 3000)
      : undefined;
    try {
      const response = await fetch(input, init);
      if (slowRequestTimer) clearTimeout(slowRequestTimer);
      if (retryable && (response.status === 502 || response.status === 503) && attempt < retries) {
        waking = true;
        notifyServerWaking(true);
        await delay(RETRY_DELAY_MS);
        continue;
      }
      if (waking) notifyServerWaking(false);
      return response;
    } catch {
      if (slowRequestTimer) clearTimeout(slowRequestTimer);
      if (attempt >= retries) {
        if (waking) notifyServerWaking(false);
        throw new Error('The service is waking up or temporarily unavailable. Please try again.');
      }
      waking = true;
      notifyServerWaking(true);
      await delay(RETRY_DELAY_MS);
    }
  }

  if (waking) notifyServerWaking(false);
  throw new Error('The service is waking up or temporarily unavailable. Please try again.');
}
