/**
 * Server-proxied Gemini client. All API calls go through /api/gemini
 * so the API key never reaches the browser.
 */

interface GenerateContentParams {
  model: string;
  contents: unknown;
  config?: unknown;
}

interface GenerateContentResponse {
  text: string | null;
  candidates: any[] | null;
}

export async function geminiGenerate(params: GenerateContentParams): Promise<GenerateContentResponse> {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    const errorMessage = errorBody.error || `Gemini API error: ${res.status}`;

    // Preserve error patterns that withSmartRetry checks
    if (res.status === 429) {
      throw new Error(`429 Too Many Requests: ${errorMessage}`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`${res.status} PERMISSION_DENIED: ${errorMessage}`);
    }
    throw new Error(errorMessage);
  }

  return res.json();
}

export async function geminiCacheCreate(model: string, config: unknown): Promise<string | null> {
  const res = await fetch('/api/gemini/cache', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', model, config }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.name || null;
}

export async function geminiCacheDelete(name: string): Promise<void> {
  await fetch('/api/gemini/cache', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', name }),
  });
}
