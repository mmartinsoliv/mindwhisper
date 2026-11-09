import { useState } from 'react';
import { Button, CheckIcon } from '@/components';
import { commands } from '@/services/tauri/commands';
import { useSettingsStore } from '@/stores/settingsStore';

export function MicrophoneStep({ ok, onResult }: { ok: boolean; onResult(ok: boolean): void }) {
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);

  const probe = async () => {
    setBusy(true); setError(null);
    try {
      await commands.audioProbe(useSettingsStore.getState().settings.microphoneId);
      onResult(true);
    } catch (e) {
      onResult(false);
      setError(e instanceof Error ? e.message : 'Microphone access failed. Check your system settings and try again.');
    } finally { setAttempted(true); setBusy(false); }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Microphone access</h1>
      <p className="mt-3 text-sm text-muted">While you dictate, audio is sent to your Mindwhisper server and on to a speech-to-text provider. It is never saved to disk.</p>
      <div className="mt-6 space-y-3">
        {ok ? (
          <p className="flex items-center gap-2 text-sm font-medium text-success"><span aria-hidden className="[&>svg]:size-5"><CheckIcon /></span>Your microphone is working.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button loading={busy} variant={error ? 'ghost' : 'primary'} onClick={() => void probe()}>{error || attempted ? 'Try again' : 'Allow microphone'}</Button>
            {error && <Button variant="secondary" onClick={() => void commands.openSystemSettings('microphone')}>Open system settings</Button>}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
