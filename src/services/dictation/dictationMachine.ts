import { IDLE_SNAPSHOT, type DictationEvent, type DictationSnapshot, type DictationState } from '@/types/dictation';

const ACTIVE: DictationState[] = ['recording', 'processing', 'inserting'];
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Pure reducer. Illegal events return `s` itself (same reference) so callers can detect no-ops. */
export function transition(s: DictationSnapshot, e: DictationEvent): DictationSnapshot {
  switch (e.type) {
    case 'START':
      return s.state === 'idle' ? { state: 'recording', sessionId: e.sessionId, startedAt: e.at, level: 0 } : s;
    case 'LEVEL':
      return s.state === 'recording' ? { ...s, level: clamp01(e.level) } : s;
    case 'STOP':
      return s.state === 'recording' ? { ...s, state: 'processing', level: undefined } : s;
    case 'TRANSCRIBED':
      return s.state === 'processing' ? { ...s, rawText: e.rawText } : s;
    case 'CLEANED':
      return s.state === 'processing' ? { ...s, state: 'inserting', finalText: e.finalText } : s;
    case 'INSERTED':
      return s.state === 'inserting' ? { ...s, state: 'completed' } : s;
    case 'FAIL':
      return ACTIVE.includes(s.state) ? { ...s, state: 'error', error: e.error, level: undefined } : s;
    case 'CANCEL':
      return ACTIVE.includes(s.state) ? { ...IDLE_SNAPSHOT } : s;
    case 'RETRY':
      return s.state === 'error' && s.error?.retryable
        ? { ...s, state: s.error.stage === 'insert' ? 'inserting' : 'processing', error: undefined }
        : s;
    case 'DISMISS':
      return s.state === 'error' ? { ...IDLE_SNAPSHOT } : s;
    case 'RESET':
      return s.state === 'completed' || s.state === 'error' ? { ...IDLE_SNAPSHOT } : s;
  }
}
