import type { Config } from '../config';
import { AnthropicLlmProvider } from './anthropicLlm';
import { GeminiLlmProvider } from './geminiLlm';
import { GeminiSttProvider } from './geminiStt';
import { MockLlmProvider, MockSttProvider } from './mock';
import { OpenAiSttProvider } from './openaiStt';
import type { LlmProvider, SttProvider } from './types';

export function buildProviders(config: Config): { stt: SttProvider; llm: LlmProvider } {
  const stt = config.sttProvider === 'openai'
    ? new OpenAiSttProvider({ apiKey: config.openaiApiKey!, model: config.sttModel })
    : config.sttProvider === 'gemini'
      ? new GeminiSttProvider({ apiKey: config.geminiApiKey!, model: config.sttModel })
      : new MockSttProvider();
  const llm = config.llmProvider === 'anthropic'
    ? new AnthropicLlmProvider({ apiKey: config.anthropicApiKey!, model: config.llmModel })
    : config.llmProvider === 'gemini'
      ? new GeminiLlmProvider({ apiKey: config.geminiApiKey!, model: config.llmModel })
      : new MockLlmProvider();
  return { stt, llm };
}
