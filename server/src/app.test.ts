import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { MockSttProvider, MockLlmProvider } from './providers/mock';
import { ProviderError, type SttProvider } from './providers/types';
import type { Config } from './config';

const config: Config = { port: 0, appTokens: ['tok-1'], rateLimitPerMin: 3, sttProvider: 'mock', openaiApiKey: undefined,
  sttModel: 'm', llmProvider: 'mock', anthropicApiKey: undefined, llmModel: 'm', geminiApiKey: undefined };
const auth = { Authorization: 'Bearer tok-1' };
const wav = () => new File([new Uint8Array(44 + 3200)], 'a.wav', { type: 'audio/wav' });
const form = (extra: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.append('audio', wav()); fd.append('language', 'en');
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
};
const mk = (over: Partial<Config> = {}, stt: SttProvider = new MockSttProvider()) =>
  createApp({ config: { ...config, ...over }, stt, llm: new MockLlmProvider() });

describe('health & auth', () => {
  it('serves /health without auth', async () => {
    const res = await mk().request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
  it('rejects missing and wrong tokens with 401 unauthorized', async () => {
    for (const headers of [{}, { Authorization: 'Bearer nope' }, { Authorization: 'Basic x' }] as Record<string, string>[]) {
      const res = await mk().request('/v1/cleanup', { method: 'POST', headers });
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe('unauthorized');
    }
  });
});

describe('CORS', () => {
  it('answers preflight for the Tauri webview origin without auth', async () => {
    const res = await mk().request('/v1/transcribe', { method: 'OPTIONS', headers: { Origin: 'tauri://localhost', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization' } });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('tauri://localhost');
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('authorization');
  });
});

describe('POST /v1/transcribe', () => {
  it('returns text for valid multipart', async () => {
    const res = await mk().request('/v1/transcribe', { method: 'POST', headers: auth, body: form({ vocabulary: '["Tauri"]' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.text).toBe('string');
    expect(body.provider).toBe('mock');
  });
  it('400 on missing audio', async () => {
    const fd = new FormData(); fd.append('language', 'en');
    const res = await mk().request('/v1/transcribe', { method: 'POST', headers: auth, body: fd });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_request');
  });
  it('400 on bad language or bad vocabulary', async () => {
    for (const extra of [{ language: 'fr' }, { vocabulary: 'not json' }, { vocabulary: '[1]' }, { vocabulary: JSON.stringify(Array(101).fill('a')) }] as Record<string, string>[]) {
      const res = await mk().request('/v1/transcribe', { method: 'POST', headers: auth, body: form(extra) });
      expect(res.status).toBe(400);
    }
  });
  it('maps provider failures to 502 without leaking details', async () => {
    const stt: SttProvider = { name: 'x', transcribe: async () => { throw new ProviderError('secret upstream detail', 'provider_error'); } };
    const res = await mk({}, stt).request('/v1/transcribe', { method: 'POST', headers: auth, body: form() });
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain('secret upstream detail');
  });
  it('maps provider timeouts to 504', async () => {
    const stt: SttProvider = { name: 'x', transcribe: async () => { throw new ProviderError('t', 'provider_timeout'); } };
    const res = await mk({}, stt).request('/v1/transcribe', { method: 'POST', headers: auth, body: form() });
    expect(res.status).toBe(504);
  });
});

describe('POST /v1/cleanup', () => {
  const body = (o: object = {}) => JSON.stringify({ text: 'um hey john', language: 'en', style: 'minimal', removeFillers: true, autoPunctuation: true, dictionary: [], ...o });
  const post = (b: string) => mk().request('/v1/cleanup', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: b });
  it('returns cleaned text', async () => {
    const res = await post(body());
    expect(res.status).toBe(200);
    expect((await res.json()).text).toBe('Hey john.');
  });
  it('413 payload_too_large for a body over the size cap', async () => {
    const res = await post(body({ text: 'a'.repeat(300 * 1024) }));
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe('payload_too_large');
  });
  it('400 on invalid style, empty text, oversized text', async () => {
    for (const b of [body({ style: 'verbatim' }), body({ text: '' }), body({ text: 'a'.repeat(20001) }), '{bad']) {
      expect((await post(b)).status).toBe(400);
    }
  });
});

describe('rate limit', () => {
  it('returns 429 after the per-minute budget', async () => {
    const app = mk({ rateLimitPerMin: 2 });
    const hit = () => app.request('/v1/cleanup', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: '{}' });
    expect((await hit()).status).toBe(400);
    expect((await hit()).status).toBe(400);
    const third = await hit();
    expect(third.status).toBe(429);
    expect((await third.json()).error.code).toBe('rate_limited');
  });
});
