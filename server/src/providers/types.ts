export type Language = 'auto' | 'en' | 'pt-BR';
export interface SttRequest { audio: Uint8Array; language: Language; vocabulary: string[]; signal?: AbortSignal }
export interface SttResult { text: string; language: string | null; durationMs: number | null }
export interface SttProvider { readonly name: string; transcribe(req: SttRequest): Promise<SttResult> }
export interface CleanupRequest { text: string; language: Language; style: 'minimal'|'professional'|'casual'|'concise'; removeFillers: boolean; autoPunctuation: boolean; dictionary: { term: string; spoken?: string }[]; signal?: AbortSignal }
export interface LlmProvider { readonly name: string; cleanup(req: CleanupRequest): Promise<string> }
export class ProviderError extends Error {
  constructor(message: string, readonly kind: 'provider_error' | 'provider_timeout') { super(message); this.name = 'ProviderError'; }
}
