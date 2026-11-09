import { useEffect, useState } from 'react';
import type { DictationSnapshot } from '@/types/dictation';
import { AlertIcon, AudioWaveform, Button, CheckIcon, IconButton, RecordingIndicator, Spinner, StopIcon, XIcon } from '@/components';

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

interface Props { snapshot: DictationSnapshot; showPreview?: boolean; onStop(): void; onCancel(): void; onRetry(): void; onDismiss(): void }

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  return <span className="tabular-nums text-sm text-muted">{formatDuration(now - since)}</span>;
}

export function FloatingOverlay({ snapshot: s, showPreview = false, onStop, onCancel, onRetry, onDismiss }: Props) {
  if (s.state === 'idle') return null;
  const shell = 'flex h-full w-full flex-col justify-center border border-border bg-surface/80 px-4 shadow-soft backdrop-blur-xl';
  const preview = showPreview ? (s.state === 'inserting' ? s.finalText : s.state === 'processing' ? s.rawText : undefined) : undefined;

  if (s.state === 'error') {
    return (
      <div role="alert" className={`${shell} gap-2 rounded-3xl py-3`}>
        <div className="flex items-start gap-2 text-sm text-text"><AlertIcon className="mt-0.5 shrink-0 text-danger" /><span className="line-clamp-2">{s.error?.message}</span></div>
        <div className="flex justify-end gap-2">
          {s.error?.retryable && <Button size="sm" onClick={onRetry}>Retry</Button>}
          <Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>
        </div>
      </div>
    );
  }

  const label = s.state === 'recording' ? 'Recording' : s.state === 'processing' ? (s.rawText ? 'Cleaning up…' : 'Transcribing…') : s.state === 'inserting' ? 'Inserting…' : 'Inserted';
  return (
    <div className={`${shell} gap-1 ${preview ? 'rounded-3xl py-3' : 'rounded-full'}`}>
      <div className="flex items-center gap-3">
        <RecordingIndicator state={s.state === 'inserting' ? 'processing' : s.state} />
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* The live region holds only the state label, so assistive tech hears state changes and nothing else. */}
          <span role="status" aria-live="polite" className={s.state === 'recording' ? 'sr-only' : s.state === 'completed' ? 'flex items-center gap-2 text-sm font-medium text-success' : 'flex items-center gap-2 text-sm text-text'}>
            {s.state === 'completed' && <CheckIcon aria-hidden="true" />}
            {s.state !== 'recording' && s.state !== 'completed' && <Spinner />}
            {label}
          </span>
          {s.state === 'recording' && (
            <>
              <AudioWaveform level={s.level ?? 0} active bars={20} />
              {s.startedAt !== undefined && <Elapsed since={s.startedAt} />}
            </>
          )}
        </div>
        {s.state === 'recording' && (
          <div className="flex items-center gap-1">
            <IconButton label="Stop dictation" onClick={onStop}><StopIcon /></IconButton>
            <IconButton label="Cancel dictation" onClick={onCancel}><XIcon /></IconButton>
          </div>
        )}
        {(s.state === 'processing' || s.state === 'inserting') && <IconButton label="Cancel" onClick={onCancel}><XIcon /></IconButton>}
      </div>
      {preview && <p className="line-clamp-2 text-xs text-muted">{preview}</p>}
    </div>
  );
}
