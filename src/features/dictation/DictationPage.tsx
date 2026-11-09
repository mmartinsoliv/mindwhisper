import { useMemo } from 'react';
import { Card, IconButton, CopyIcon, Kbd, MicIcon, StopIcon } from '@/components';
import { useDictationStore } from '@/stores/dictationStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { snippet } from '@/features/history/snippet';
import { formatAccelerator } from './accelerator';

const MODE_HELP = {
  toggle: 'Press once to start, again to stop. Esc cancels.',
  hold: 'Hold to talk, release to finish. Esc cancels.',
};

export function DictationPage() {
  const snapshot = useDictationStore((s) => s.snapshot);
  const send = useDictationStore((s) => s.send);
  const { shortcut } = useSettingsStore((s) => s.settings);
  const stored = useHistoryStore((s) => s.entries);
  const entries = useMemo(() => [...stored].sort((a, b) => b.createdAt - a.createdAt), [stored]);

  const { state, error } = snapshot;
  const recording = state === 'recording';
  const busy = state === 'processing' || state === 'inserting';
  const label = recording ? 'Stop dictation' : busy ? 'Dictation in progress' : 'Start dictation';
  const caption = error ? error.message : recording ? 'Listening…' : busy ? 'Working on it…' : 'Press your shortcut anywhere to dictate, or use the button.';

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Dictation</h1>

      <section className="flex flex-col items-center gap-4 py-6 text-center" aria-label="Record">
        <button type="button" aria-label={label} disabled={busy} onClick={() => void send({ type: 'toggle' })}
          className={`inline-flex size-24 items-center justify-center rounded-full shadow-soft transition disabled:cursor-not-allowed disabled:opacity-60 ${recording ? 'bg-danger text-danger-contrast mw-pulse' : 'bg-accent text-accent-contrast hover:brightness-110'}`}>
          <span aria-hidden className="[&>svg]:size-9">{recording ? <StopIcon /> : <MicIcon />}</span>
        </button>
        <p role={error ? 'alert' : 'status'} className={`max-w-sm text-sm ${error ? 'text-danger' : 'text-muted'}`}>{caption}</p>
      </section>

      <Card>
        <h2 className="text-sm font-semibold">Shortcut</h2>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {formatAccelerator(shortcut.accelerator).map((k, i) => <Kbd key={i}>{k}</Kbd>)}
        </div>
        <p className="mt-3 text-sm text-muted">{MODE_HELP[shortcut.mode]}</p>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Recent</h2>
        {entries.length === 0 ? (
          <p className="text-sm text-muted">No dictations yet. Focus any text field and press the shortcut.</p>
        ) : (
          <ul className="space-y-2">
            {entries.slice(0, 5).map((e) => (
              <li key={e.id} data-testid="recent-item" className="flex items-start gap-3 rounded-control border border-border bg-surface px-4 py-3">
                <p className="line-clamp-2 min-w-0 flex-1 text-sm">{e.finalText}</p>
                <IconButton label={`Copy: ${snippet(e.finalText)}`} title="Copy" onClick={() => void navigator.clipboard.writeText(e.finalText)}><CopyIcon className="size-4" /></IconButton>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
