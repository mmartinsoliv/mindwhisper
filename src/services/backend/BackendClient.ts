import { ProviderError, type TranscriptionResult } from '@/services/transcription/TranscriptionProvider';
import type { CleanupStyle, Language } from '@/types/settings';

export interface CleanupWire {
  text: string; language: Language; style: Exclude<CleanupStyle, 'verbatim'>;
  removeFillers: boolean; autoPunctuation: boolean; dictionary: { term: string; spoken?: string }[];
}
export interface BackendConfig { url: string; token: string }

const isAbort = (e: unknown) => (e as { name?: string })?.name === 'AbortError';

function fromStatus(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError('The server rejected your access token. Check it in Settings → Backend.', 'unauthorized', false);
  if (status === 429) return new ProviderError('Too many requests. Wait a few seconds and retry.', 'rate_limited', true);
  if (status === 413) return new ProviderError('That recording is too long to send. Try a shorter dictation.', 'invalid_request', false);
  if (status === 400) return new ProviderError('The server could not read that request.', 'invalid_request', false);
  if (status === 504) return new ProviderError('The speech service timed out. Try again.', 'timeout', true);
  return new ProviderError('The speech service had a problem. Try again.', 'provider_error', true);
}

const badBody = () => new ProviderError('The speech service sent an unexpected response. Try again.', 'provider_error', true);

/** Parses a 200 JSON body and requires a string `text`; anything else is a retryable provider error. */
async function readText(res: Response): Promise<Record<string, unknown> & { text: string }> {
  let body: unknown;
  try { body = await res.json(); } catch { throw badBody(); }
  if (typeof body !== 'object' || body === null || typeof (body as { text?: unknown }).text !== 'string') throw badBody();
  return body as Record<string, unknown> & { text: string };
}

export class BackendClient {
  constructor(private readonly getConfig: () => BackendConfig, private readonly fetchImpl: typeof fetch = (...a) => fetch(...a)) {}

  private async request(path: string, init: RequestInit & { headers?: Record<string, string> }): Promise<Response> {
    const { url, token } = this.getConfig();
    if (!token) throw new ProviderError('Add your access token in Settings → Backend.', 'unauthorized', false);
    let res: Response;
    try {
      res = await this.fetchImpl(`${url.replace(/\/+$/, '')}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
    } catch (e) {
      if (isAbort(e)) throw new ProviderError('Cancelled.', 'aborted', false);
      throw new ProviderError('Cannot reach the Mindwhisper server. Check your connection and the backend URL in Settings.', 'network', true);
    }
    if (!res.ok) throw fromStatus(res.status);
    return res;
  }

  async transcribe(wav: Uint8Array, o: { language: Language; vocabulary: string[]; signal?: AbortSignal }): Promise<TranscriptionResult> {
    const fd = new FormData();
    fd.append('audio', new Blob([wav as BlobPart], { type: 'audio/wav' }), 'audio.wav');
    fd.append('language', o.language);
    fd.append('vocabulary', JSON.stringify(o.vocabulary));
    const res = await this.request('/v1/transcribe', { method: 'POST', body: fd, signal: o.signal });
    return (await readText(res)) as unknown as TranscriptionResult;
  }

  async cleanup(wire: CleanupWire, signal?: AbortSignal): Promise<string> {
    const res = await this.request('/v1/cleanup', { method: 'POST', body: JSON.stringify(wire), headers: { 'Content-Type': 'application/json' }, signal });
    return (await readText(res)).text;
  }
}
