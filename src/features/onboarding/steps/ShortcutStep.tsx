import { useEffect, useState } from 'react';
import { Toggle } from '@/components';
import { ShortcutCapture } from '@/features/settings/ShortcutCapture';
import { useShortcutSettings } from '@/features/settings/useShortcutSettings';
import { commands, CommandError } from '@/services/tauri/commands';
import { useSettingsStore } from '@/stores/settingsStore';

export function ShortcutStep({ register }: { register(fn: () => Promise<void>): void }) {
  const settings = useSettingsStore((s) => s.settings);
  const shortcut = useShortcutSettings();
  const [registerError, setRegisterError] = useState<string | null>(null);

  // The shell's Next button runs this first so the shortcut is live before the test step.
  useEffect(() => {
    register(async () => {
      const { shortcut: s } = useSettingsStore.getState().settings;
      try { await commands.shortcutRegister(s.accelerator, s.mode); setRegisterError(null); }
      catch (e) {
        setRegisterError(e instanceof CommandError ? e.message : 'Could not register this shortcut. Pick a different one.');
        throw e;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Your shortcut</h1>
      <p className="mt-3 text-sm text-muted">Press it in any app to start and stop dictating. You can change it any time in Settings.</p>
      <div className="mt-6 space-y-4">
        <ShortcutCapture value={settings.shortcut.accelerator} onChange={shortcut.changeAccelerator} error={shortcut.error ?? registerError} />
        <Toggle label="Hold to talk" description="Hold the shortcut while speaking instead of pressing twice."
          checked={settings.shortcut.mode === 'hold'} onChange={(v) => void shortcut.changeMode(v ? 'hold' : 'toggle')} />
      </div>
    </div>
  );
}
