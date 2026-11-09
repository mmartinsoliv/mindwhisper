import type { Config } from './config';

/** Worker `env` mixes variables, secrets (strings) and bindings (objects); `loadConfig` only understands strings. */
export function stringVars(env: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => typeof e[1] === 'string'));
}

/** `loadConfig` defaults both providers to `mock`; on a public Worker that would silently serve fake transcripts. */
export function assertProductionConfig(config: Config): void {
  if (config.sttProvider === 'mock') throw new Error('STT_PROVIDER must be set to a real provider on the Worker');
  if (config.llmProvider === 'mock') throw new Error('LLM_PROVIDER must be set to a real provider on the Worker');
}
