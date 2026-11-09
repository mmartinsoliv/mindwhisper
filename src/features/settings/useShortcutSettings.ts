import { useState } from 'react';
import { commands, CommandError } from '@/services/tauri/commands';
import { useSettingsStore } from '@/stores/settingsStore';

/** Register-before-save: a shortcut or mode is persisted only after the native layer accepted it. */
export function useShortcutSettings() {
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => setError(e instanceof CommandError ? e.message : 'Could not register this shortcut. Try a different one.');

  const changeAccelerator = async (accelerator: string) => {
    const { settings, update } = useSettingsStore.getState();
    try {
      await commands.shortcutRegister(accelerator, settings.shortcut.mode);
      await update({ shortcut: { accelerator } });
      setError(null);
    } catch (e) { fail(e); }
  };

  const changeMode = async (mode: 'toggle' | 'hold') => {
    const { settings, update } = useSettingsStore.getState();
    try {
      await commands.shortcutRegister(settings.shortcut.accelerator, mode);
      await update({ shortcut: { mode } });
      setError(null);
    } catch (e) { fail(e); }
  };

  return { error, setError, changeAccelerator, changeMode };
}
