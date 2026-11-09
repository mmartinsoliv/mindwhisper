import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, CopyIcon, IconButton, RetryIcon, SearchIcon, TrashIcon } from '@/components';
import { useHistoryStore } from '@/stores/historyStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { HistoryEntry } from '@/types/history';
import { reinsertText } from './reinsert';
import { snippet } from './snippet';

const CONFIRM_MS = 4000;
const REINSERT_FAILURE = "Couldn't paste into the app. The text is on your clipboard — paste it manually, or check Accessibility permission.";
const STYLE_LABEL: Record<string, string> = { verbatim: 'Verbatim', minimal: 'Minimal', professional: 'Professional', casual: 'Casual', concise: 'Concise' };

function meta(e: HistoryEntry) {
  const date = new Date(e.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return `${date} · ${e.language} · ${STYLE_LABEL[e.style] ?? e.style}`;
}

export function HistoryPage() {
  const { entries: stored, query, setQuery, remove, clearAll } = useHistoryStore();
  const entries = useMemo(() => [...stored].sort((a, b) => b.createdAt - a.createdAt), [stored]);
  const settings = useSettingsStore((s) => s.settings);
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onClear = () => {
    if (!confirming) {
      setConfirming(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setConfirming(false), CONFIRM_MS);
      return;
    }
    clearTimeout(timer.current);
    setConfirming(false);
    void clearAll();
  };

  const reinsert = async (e: HistoryEntry) => {
    setFailure(null);
    try { await reinsertText(e.finalText, settings.restoreClipboard); }
    catch { setFailure({ id: e.id, message: REINSERT_FAILURE }); }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">History</h1>
      <div className="flex items-center gap-3">
        <label className="relative block flex-1">
          <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted [&>svg]:size-4"><SearchIcon /></span>
          <input type="search" aria-label="Search history" placeholder="Search history" value={query} onChange={(e) => setQuery(e.target.value)}
            className="h-10 w-full rounded-control border border-border-strong bg-surface pl-9 pr-3 text-sm text-text placeholder:text-muted focus-visible:border-accent" />
        </label>
        <Button variant={confirming ? 'danger' : 'secondary'} onClick={onClear} disabled={entries.length === 0}>{confirming ? 'Confirm clear' : 'Clear all'}</Button>
      </div>

      {entries.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          {!settings.history.enabled ? 'History is off. Turn it on in Settings.' : query ? 'No matches.' : 'Nothing here yet.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.id} data-testid="history-item" className="rounded-control border border-border bg-surface px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words text-sm">{e.finalText}</p>
                  <p className="mt-1 text-xs text-muted">{meta(e)}</p>
                </div>
                <div className="flex shrink-0 items-center">
                  <IconButton label={`Copy: ${snippet(e.finalText)}`} title="Copy" onClick={() => void navigator.clipboard.writeText(e.finalText)}><CopyIcon className="size-4" /></IconButton>
                  <IconButton label={`Reinsert: ${snippet(e.finalText)}`} title="Reinsert into the previous app" onClick={() => void reinsert(e)}><RetryIcon className="size-4" /></IconButton>
                  <IconButton label={`Delete: ${snippet(e.finalText)}`} title="Delete" onClick={() => void remove(e.id)}><TrashIcon className="size-4" /></IconButton>
                </div>
              </div>
              {failure?.id === e.id && <p role="alert" className="mt-2 text-xs text-danger">{failure.message}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
