import { ProviderError } from './types';

export interface GeminiOpts { apiKey: string; model: string; fetchImpl?: typeof fetch; baseUrl?: string }

interface GeminiResponse {
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
}

// Shared by the Gemini speech and cleanup adapters: one generateContent call, vendor failures mapped to ProviderError.
// Returns the concatenated answer text ('' when the model answered with nothing).
export async function generateText(o: GeminiOpts, body: unknown, signal: AbortSignal | undefined, what: 'transcription' | 'cleanup'): Promise<string> {
  const f = o.fetchImpl ?? fetch;
  let json: GeminiResponse | null;
  try {
    const res = await f(`${o.baseUrl ?? 'https://generativelanguage.googleapis.com'}/v1beta/models/${encodeURIComponent(o.model)}:generateContent`, {
      method: 'POST', headers: { 'x-goog-api-key': o.apiKey, 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
    if (!res.ok) throw new ProviderError(`${what} provider returned ${res.status}`, 'provider_error');
    json = (await res.json()) as GeminiResponse | null;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    const name = (e as { name?: string }).name;
    throw new ProviderError(`${what} request failed`, name === 'TimeoutError' || name === 'AbortError' ? 'provider_timeout' : 'provider_error');
  }
  if (json?.promptFeedback?.blockReason) throw new ProviderError(`${what} request blocked`, 'provider_error');
  const candidate = json?.candidates?.[0];
  if (!candidate) throw new ProviderError(`${what} provider returned no answer`, 'provider_error');
  // A cut-off or filtered answer would silently drop part of the user's dictation.
  if (candidate.finishReason !== undefined && candidate.finishReason !== 'STOP') throw new ProviderError(`${what} output incomplete`, 'provider_error');
  return (candidate.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('').trim();
}
