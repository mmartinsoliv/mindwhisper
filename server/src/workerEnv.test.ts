import { describe, expect, it } from 'vitest';
import type { Config } from './config';
import { assertProductionConfig, stringVars } from './workerEnv';

describe('stringVars', () => {
  it('keeps string vars and secrets and drops bindings and other non-strings', () => {
    expect(stringVars({ APP_TOKENS: 'a,b', STT_PROVIDER: 'openai', RATE_LIMITER: { limit() {} }, N: 3, U: undefined, B: true }))
      .toEqual({ APP_TOKENS: 'a,b', STT_PROVIDER: 'openai' });
  });
});

describe('assertProductionConfig', () => {
  const base: Config = { port: 0, appTokens: ['t'], rateLimitPerMin: 30, sttProvider: 'openai', openaiApiKey: 'k',
    sttModel: 'm', llmProvider: 'anthropic', anthropicApiKey: 'k', llmModel: 'm', geminiApiKey: undefined };
  it('accepts real providers', () => { expect(() => assertProductionConfig(base)).not.toThrow(); });
  it('refuses a mock speech or text provider so a missing variable never serves fake transcripts', () => {
    expect(() => assertProductionConfig({ ...base, sttProvider: 'mock' })).toThrow(/STT_PROVIDER/);
    expect(() => assertProductionConfig({ ...base, llmProvider: 'mock' })).toThrow(/LLM_PROVIDER/);
  });
});
