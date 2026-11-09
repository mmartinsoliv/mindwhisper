import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().default(8787),
  APP_TOKENS: z.string().default(''),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(30),
  STT_PROVIDER: z.enum(['openai', 'gemini', 'mock']).default('mock'),
  OPENAI_API_KEY: z.string().optional(),
  STT_MODEL: z.string().optional(),
  LLM_PROVIDER: z.enum(['anthropic', 'gemini', 'mock']).default('mock'),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
});

// Model names are provider specific, so the default depends on the chosen provider.
const STT_MODEL_DEFAULT = { openai: 'gpt-4o-mini-transcribe', gemini: 'gemini-2.5-flash', mock: 'gpt-4o-mini-transcribe' } as const;
const LLM_MODEL_DEFAULT = { anthropic: 'claude-haiku-5-5', gemini: 'gemini-2.5-flash-lite', mock: 'claude-haiku-5-5' } as const;

export interface Config {
  port: number; appTokens: string[]; rateLimitPerMin: number;
  sttProvider: 'openai' | 'gemini' | 'mock'; openaiApiKey: string | undefined; sttModel: string;
  llmProvider: 'anthropic' | 'gemini' | 'mock'; anthropicApiKey: string | undefined; llmModel: string;
  geminiApiKey: string | undefined;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // .env.example lists every name with a blank value; a blank (or whitespace-only) entry means "use the default".
  const set = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ''));
  const e = schema.parse(set);
  const appTokens = e.APP_TOKENS.split(',').map((t) => t.trim()).filter(Boolean);
  if (appTokens.length === 0) throw new Error('APP_TOKENS must contain at least one token');
  if (e.STT_PROVIDER === 'openai' && !e.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required when STT_PROVIDER=openai');
  if (e.LLM_PROVIDER === 'anthropic' && !e.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic');
  if ((e.STT_PROVIDER === 'gemini' || e.LLM_PROVIDER === 'gemini') && !e.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required when STT_PROVIDER=gemini or LLM_PROVIDER=gemini');
  return { port: e.PORT, appTokens, rateLimitPerMin: e.RATE_LIMIT_PER_MIN, sttProvider: e.STT_PROVIDER,
    openaiApiKey: e.OPENAI_API_KEY, sttModel: e.STT_MODEL ?? STT_MODEL_DEFAULT[e.STT_PROVIDER], llmProvider: e.LLM_PROVIDER,
    anthropicApiKey: e.ANTHROPIC_API_KEY, llmModel: e.LLM_MODEL ?? LLM_MODEL_DEFAULT[e.LLM_PROVIDER], geminiApiKey: e.GEMINI_API_KEY };
}
