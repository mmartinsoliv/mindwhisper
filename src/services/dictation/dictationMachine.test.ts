import { describe, expect, it } from 'vitest';
import { transition } from './dictationMachine';
import { IDLE_SNAPSHOT, type DictationEvent, type DictationSnapshot } from '@/types/dictation';

const run = (events: DictationEvent[], from: DictationSnapshot = IDLE_SNAPSHOT) => events.reduce(transition, from);
const START: DictationEvent = { type: 'START', sessionId: 's1', at: 1000 };
const err = (stage: 'record' | 'transcribe' | 'cleanup' | 'insert', retryable = true): DictationEvent => ({ type: 'FAIL', error: { stage, message: 'm', retryable } });

describe('happy path', () => {
  it('walks idle → recording → processing → inserting → completed → idle', () => {
    let s = run([START]);
    expect(s).toMatchObject({ state: 'recording', sessionId: 's1', startedAt: 1000 });
    s = run([{ type: 'STOP' }], s); expect(s.state).toBe('processing');
    s = run([{ type: 'TRANSCRIBED', rawText: 'um hi' }], s); expect(s).toMatchObject({ state: 'processing', rawText: 'um hi' });
    s = run([{ type: 'CLEANED', finalText: 'Hi.' }], s); expect(s).toMatchObject({ state: 'inserting', finalText: 'Hi.' });
    s = run([{ type: 'INSERTED' }], s); expect(s.state).toBe('completed');
    s = run([{ type: 'RESET' }], s); expect(s).toEqual(IDLE_SNAPSHOT);
  });
});

describe('illegal events are ignored (same reference returned)', () => {
  it.each([
    ['START while recording', run([START]), START],
    ['START while processing', run([START, { type: 'STOP' }]), START],
    ['STOP while idle', IDLE_SNAPSHOT, { type: 'STOP' } as DictationEvent],
    ['INSERTED while processing', run([START, { type: 'STOP' }]), { type: 'INSERTED' } as DictationEvent],
    ['CLEANED while recording', run([START]), { type: 'CLEANED', finalText: 'x' } as DictationEvent],
    ['CANCEL while idle', IDLE_SNAPSHOT, { type: 'CANCEL' } as DictationEvent],
    ['RETRY while idle', IDLE_SNAPSHOT, { type: 'RETRY' } as DictationEvent],
    ['FAIL while idle', IDLE_SNAPSHOT, err('record')],
    ['LEVEL while idle', IDLE_SNAPSHOT, { type: 'LEVEL', level: 0.5 } as DictationEvent],
  ])('%s', (_n, from, ev) => { expect(transition(from, ev)).toBe(from); });
});

describe('cancellation', () => {
  it.each([
    ['recording', [START]], ['processing', [START, { type: 'STOP' as const }]],
    ['inserting', [START, { type: 'STOP' as const }, { type: 'CLEANED' as const, finalText: 'x' }]],
  ])('CANCEL from %s returns to idle', (_n, evs) => {
    expect(run([...(evs as DictationEvent[]), { type: 'CANCEL' }])).toEqual(IDLE_SNAPSHOT);
  });
  it('CANCEL does nothing once completed', () => {
    const done = run([START, { type: 'STOP' }, { type: 'CLEANED', finalText: 'x' }, { type: 'INSERTED' }]);
    expect(transition(done, { type: 'CANCEL' })).toBe(done);
  });
});

describe('errors and retry', () => {
  it('FAIL from recording/processing/inserting goes to error and clears the level', () => {
    for (const evs of [[START], [START, { type: 'STOP' as const }], [START, { type: 'STOP' as const }, { type: 'CLEANED' as const, finalText: 'x' }]]) {
      const s = run([...(evs as DictationEvent[]), err('transcribe')]);
      expect(s.state).toBe('error');
      expect(s.error).toEqual({ stage: 'transcribe', message: 'm', retryable: true });
      expect(s.level).toBeUndefined();
    }
  });
  it('RETRY re-enters processing for transcribe/cleanup and inserting for insert', () => {
    expect(run([START, { type: 'STOP' }, err('transcribe'), { type: 'RETRY' }])).toMatchObject({ state: 'processing', error: undefined, sessionId: 's1' });
    expect(run([START, { type: 'STOP' }, err('cleanup'), { type: 'RETRY' }]).state).toBe('processing');
    expect(run([START, { type: 'STOP' }, { type: 'CLEANED', finalText: 'x' }, err('insert'), { type: 'RETRY' }])).toMatchObject({ state: 'inserting', finalText: 'x' });
  });
  it('RETRY is ignored when the error is not retryable', () => {
    const s = run([START, err('record', false)]);
    expect(transition(s, { type: 'RETRY' })).toBe(s);
  });
  it('DISMISS and RESET leave error for idle', () => {
    expect(run([START, err('record'), { type: 'DISMISS' }])).toEqual(IDLE_SNAPSHOT);
    expect(run([START, err('record'), { type: 'RESET' }])).toEqual(IDLE_SNAPSHOT);
  });
});

describe('level', () => {
  it('clamps to 0..1 while recording', () => {
    expect(run([START, { type: 'LEVEL', level: 5 }]).level).toBe(1);
    expect(run([START, { type: 'LEVEL', level: -1 }]).level).toBe(0);
  });
});
