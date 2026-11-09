export type DictationState = 'idle' | 'recording' | 'processing' | 'inserting' | 'completed' | 'error';
export type DictationStage = 'record' | 'transcribe' | 'cleanup' | 'insert';
export interface DictationError { stage: DictationStage; message: string; retryable: boolean }
export interface DictationSnapshot { state: DictationState; sessionId: string | null; startedAt?: number; level?: number; rawText?: string; finalText?: string; error?: DictationError }
export type DictationEvent =
  | { type: 'START'; sessionId: string; at: number }
  | { type: 'LEVEL'; level: number }
  | { type: 'STOP' }
  | { type: 'TRANSCRIBED'; rawText: string }
  | { type: 'CLEANED'; finalText: string }
  | { type: 'INSERTED' }
  | { type: 'FAIL'; error: DictationError }
  | { type: 'CANCEL' }
  | { type: 'RETRY' }
  | { type: 'DISMISS' }
  | { type: 'RESET' };

export const IDLE_SNAPSHOT: DictationSnapshot = { state: 'idle', sessionId: null };
