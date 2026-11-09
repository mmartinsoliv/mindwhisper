import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('applies defaults when only APP_TOKENS is set', () => {
    const c = loadConfig({ APP_TOKENS: 'dev-token' });
    expect(c).toMatchObject({ port: 8787, appTokens: ['dev-token'], rateLimitPerMin: 30, sttProvider: 'mock', llmProvider: 'mock',
      sttModel: 'gpt-4o-mini-transcribe', llmModel: 'claude-haiku-5-5', openaiApiKey: undefined, anthropicApiKey: undefined });
  });
  it('treats blank values (as copied from .env.example) as unset', () => {
    const c = loadConfig({ PORT: '', APP_TOKENS: 'dev-token', RATE_LIMIT_PER_MIN: '', STT_PROVIDER: '', OPENAI_API_KEY: '',
      STT_MODEL: '', LLM_PROVIDER: '', ANTHROPIC_API_KEY: '', LLM_MODEL: '' });
    expect(c).toMatchObject({ port: 8787, rateLimitPerMin: 30, sttProvider: 'mock', llmProvider: 'mock',
      sttModel: 'gpt-4o-mini-transcribe', llmModel: 'claude-haiku-5-5', openaiApiKey: undefined, anthropicApiKey: undefined });
  });
  it('treats whitespace-only values as unset', () => {
    expect(loadConfig({ APP_TOKENS: 'dev-token', PORT: '  ' }).port).toBe(8787);
  });
  it('still honours explicit values', () => {
    const c = loadConfig({ APP_TOKENS: 'a, b', PORT: '9000', RATE_LIMIT_PER_MIN: '5' });
    expect(c).toMatchObject({ port: 9000, rateLimitPerMin: 5, appTokens: ['a', 'b'] });
  });
  it('still requires APP_TOKENS, including when blank', () => {
    expect(() => loadConfig({})).toThrow(/APP_TOKENS/);
    expect(() => loadConfig({ APP_TOKENS: '' })).toThrow(/APP_TOKENS/);
  });
  it('requires a provider key when a real provider is selected, even if the key is blank', () => {
    expect(() => loadConfig({ APP_TOKENS: 't', STT_PROVIDER: 'openai', OPENAI_API_KEY: '' })).toThrow(/OPENAI_API_KEY/);
    expect(() => loadConfig({ APP_TOKENS: 't', LLM_PROVIDER: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => loadConfig({ APP_TOKENS: 't', STT_PROVIDER: 'gemini' })).toThrow(/GEMINI_API_KEY/);
    expect(() => loadConfig({ APP_TOKENS: 't', LLM_PROVIDER: 'gemini', GEMINI_API_KEY: ' ' })).toThrow(/GEMINI_API_KEY/);
  });
  it('uses one Gemini key for both providers and a Gemini default model unless overridden', () => {
    const c = loadConfig({ APP_TOKENS: 't', STT_PROVIDER: 'gemini', LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'g' });
    expect(c).toMatchObject({ sttProvider: 'gemini', llmProvider: 'gemini', geminiApiKey: 'g', sttModel: 'gemini-2.5-flash', llmModel: 'gemini-2.5-flash-lite' });
    expect(loadConfig({ APP_TOKENS: 't', LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'g', LLM_MODEL: 'x' }).llmModel).toBe('x');
  });
});
