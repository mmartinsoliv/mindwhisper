import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FloatingOverlay, formatDuration } from './FloatingOverlay';
import { IDLE_SNAPSHOT, type DictationSnapshot } from '@/types/dictation';

const handlers = () => ({ onStop: vi.fn(), onCancel: vi.fn(), onRetry: vi.fn(), onDismiss: vi.fn() });
const snap = (s: Partial<DictationSnapshot>): DictationSnapshot => ({ ...IDLE_SNAPSHOT, ...s });

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] }); vi.setSystemTime(10_000); });
afterEach(() => { vi.useRealTimers(); });

describe('formatDuration', () => {
  it('formats m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(7_400)).toBe('0:07');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(-5)).toBe('0:00');
  });
});

describe('FloatingOverlay', () => {
  it('renders nothing when idle', () => {
    const { container } = render(<FloatingOverlay snapshot={IDLE_SNAPSHOT} {...handlers()} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('recording: shows waveform, elapsed time, and working stop / cancel controls', async () => {
    const h = handlers();
    vi.useRealTimers();
    render(<FloatingOverlay snapshot={snap({ state: 'recording', sessionId: 's', startedAt: Date.now() - 7_000, level: 0.5 })} {...h} />);
    expect(screen.getByRole('status')).toHaveTextContent(/recording/i);
    expect(screen.getByRole('img', { name: /audio level/i })).toBeInTheDocument();
    expect(screen.getByText(/0:0[6-8]/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /stop dictation/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancel dictation/i }));
    expect(h.onStop).toHaveBeenCalledTimes(1);
    expect(h.onCancel).toHaveBeenCalledTimes(1);
  });
  it('recording: the live region holds only the state label, not the waveform or the ticking timer', () => {
    render(<FloatingOverlay snapshot={snap({ state: 'recording', sessionId: 's', startedAt: Date.now() - 7_000, level: 0.5 })} {...handlers()} />);
    const live = screen.getByRole('status');
    expect(live).toHaveTextContent(/^Recording$/);
    expect(live).not.toContainElement(screen.getByText(/0:0[6-8]/));
    expect(live).not.toContainElement(screen.getByRole('img', { name: /audio level/i }));
  });
  it('shows the recognized text preview only while processing or inserting', () => {
    const { rerender } = render(<FloatingOverlay snapshot={snap({ state: 'completed', sessionId: 's', rawText: 'um hello there', finalText: 'Hello there.' })} showPreview {...handlers()} />);
    expect(screen.queryByText('um hello there')).not.toBeInTheDocument();
    expect(screen.queryByText('Hello there.')).not.toBeInTheDocument();
    rerender(<FloatingOverlay snapshot={snap({ state: 'inserting', sessionId: 's', rawText: 'um hello there', finalText: 'Hello there.' })} showPreview {...handlers()} />);
    expect(screen.getByText('Hello there.')).toBeInTheDocument();
  });
  it('processing: shows progress text, and the recognized text only when preview is on', () => {
    const s = snap({ state: 'processing', sessionId: 's', rawText: 'um hello there' });
    const { rerender } = render(<FloatingOverlay snapshot={s} showPreview {...handlers()} />);
    expect(screen.getByRole('status')).toHaveTextContent(/cleaning up/i);
    expect(screen.getByText('um hello there')).toBeInTheDocument();
    rerender(<FloatingOverlay snapshot={s} showPreview={false} {...handlers()} />);
    expect(screen.queryByText('um hello there')).not.toBeInTheDocument();
    rerender(<FloatingOverlay snapshot={snap({ state: 'processing', sessionId: 's' })} {...handlers()} />);
    expect(screen.getByRole('status')).toHaveTextContent(/transcribing/i);
  });
  it('inserting and completed states', () => {
    const { rerender } = render(<FloatingOverlay snapshot={snap({ state: 'inserting', sessionId: 's', finalText: 'Hello.' })} showPreview {...handlers()} />);
    expect(screen.getByRole('status')).toHaveTextContent(/inserting/i);
    rerender(<FloatingOverlay snapshot={snap({ state: 'completed', sessionId: 's' })} {...handlers()} />);
    expect(screen.getByRole('status')).toHaveTextContent(/inserted/i);
  });
  it('error: shows the message with Retry (when retryable) and Dismiss', async () => {
    const h = handlers();
    const { rerender } = render(<FloatingOverlay snapshot={snap({ state: 'error', sessionId: 's', error: { stage: 'transcribe', message: 'The speech service timed out. Try again.', retryable: true } })} {...h} />);
    expect(screen.getByRole('alert')).toHaveTextContent('The speech service timed out. Try again.');
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(h.onRetry).toHaveBeenCalledTimes(1);
    expect(h.onDismiss).toHaveBeenCalledTimes(1);
    rerender(<FloatingOverlay snapshot={snap({ state: 'error', sessionId: 's', error: { stage: 'record', message: 'No microphone found.', retryable: false } })} {...h} />);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });
});
