import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import type { Config } from '../config';
import { MockLlmProvider, MockSttProvider } from '../providers/mock';
import { rateLimitBinding, type RateLimitBinding } from './rateLimitBinding';

const config: Config = { port: 0, appTokens: ['tok-1'], rateLimitPerMin: 1000, sttProvider: 'mock', openaiApiKey: undefined,
  sttModel: 'm', llmProvider: 'mock', anthropicApiKey: undefined, llmModel: 'm', geminiApiKey: undefined };
const post = (app: ReturnType<typeof createApp>) =>
  app.request('/v1/cleanup', { method: 'POST', headers: { Authorization: 'Bearer tok-1', 'Content-Type': 'application/json' }, body: '{}' });

describe('rateLimitBinding', () => {
  it('asks the binding once per request, keyed by the token id, and lets allowed requests through', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const app = createApp({ config, stt: new MockSttProvider(), llm: new MockLlmProvider(), limiter: rateLimitBinding({ limit } satisfies RateLimitBinding) });
    const res = await post(app);
    expect(res.status).not.toBe(429);
    expect(limit).toHaveBeenCalledTimes(1);
    const key = (limit.mock.calls[0] as unknown as [{ key: string }])[0].key;
    expect(key).toMatch(/^[0-9a-f]{16}$/); // auth middleware's tokenId, never the raw token
    expect(key).not.toContain('tok-1');
  });

  it('answers 429 rate_limited when the binding refuses', async () => {
    const app = createApp({ config, stt: new MockSttProvider(), llm: new MockLlmProvider(), limiter: rateLimitBinding({ limit: async () => ({ success: false }) }) });
    const res = await post(app);
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe('rate_limited');
  });

  it('is used instead of the in-memory limiter when provided', async () => {
    const app = createApp({ config: { ...config, rateLimitPerMin: 1 }, stt: new MockSttProvider(), llm: new MockLlmProvider(), limiter: async (_c, next) => { await next(); } });
    expect((await post(app)).status).not.toBe(429);
    expect((await post(app)).status).not.toBe(429); // the built-in limiter (1 per minute) would have refused this one
  });
});
