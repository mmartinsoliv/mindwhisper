import { useEffect, useRef, useState } from 'react';
import { Button, CommitTextField } from '@/components';
import { commands } from '@/services/tauri/commands';
import { useDictationStore } from '@/stores/dictationStore';
import { useSettingsStore } from '@/stores/settingsStore';

function statusText(state: string, error?: string): string {
  if (error) return error;
  switch (state) {
    case 'recording': return 'Listening…';
    case 'processing': return 'Working…';
    case 'inserting': return 'Inserting…';
    case 'completed': return 'Inserted ✓';
    default: return 'Idle';
  }
}

export function TestStep({ onSkippable }: { onSkippable(v: boolean): void }) {
  const snapshot = useDictationStore((s) => s.snapshot);
  const backend = useSettingsStore((s) => s.settings.backend);
  const update = useSettingsStore((s) => s.update);
  const [needsAccessibility, setNeedsAccessibility] = useState(false);
  // Decided once on mount: the token persists per keystroke, so re-deriving it would unmount the fields mid-typing.
  const [showConnect] = useState(() => backend.token === '');
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    onSkippable(true);
    commands.checkPermissions().then((p) => setNeedsAccessibility(p.accessibility === 'denied')).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    area.current?.focus();
    await useDictationStore.getState().send({ type: 'toggle' });
    area.current?.focus();
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Try it</h1>
      <p className="mt-3 text-sm text-muted">Click the box, press your shortcut, say a sentence, then press it again.</p>

      {showConnect && (
        <div className="mt-5 space-y-3 rounded-control border border-border bg-surface-2 p-4">
          <h2 className="text-sm font-semibold">Connect to your server</h2>
          <CommitTextField label="Server URL" value={backend.url} onCommit={(url) => void update({ backend: { url } })} />
          <CommitTextField label="Access token" type="password" value={backend.token} onCommit={(token) => void update({ backend: { token } })}
            hint="Ask whoever runs your Mindwhisper server. Not needed for the Skip path." />
        </div>
      )}

      {needsAccessibility && (
        <div className="mt-5 space-y-2 rounded-control border border-border bg-surface-2 p-4">
          <p className="text-sm">Mindwhisper needs Accessibility permission to type into other apps.</p>
          <Button variant="secondary" size="sm" onClick={() => void commands.openSystemSettings('accessibility')}>Open system settings</Button>
        </div>
      )}

      <textarea ref={area} aria-label="Test area" rows={4} placeholder="Your dictated text appears here."
        className="mt-5 w-full resize-none rounded-control border border-border-strong bg-surface p-3 text-sm text-text placeholder:text-muted focus-visible:border-accent" />
      <div className="mt-3 flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => void start()}>Start test</Button>
        <p role="status" className={`text-sm ${snapshot.error ? 'text-danger' : 'text-muted'}`}>{statusText(snapshot.state, snapshot.error?.message)}</p>
      </div>
    </div>
  );
}
