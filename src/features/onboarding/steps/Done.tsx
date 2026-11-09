import { Kbd } from '@/components';
import { formatAccelerator } from '@/features/dictation/accelerator';
import { useSettingsStore } from '@/stores/settingsStore';

export function Done() {
  const accelerator = useSettingsStore((s) => s.settings.shortcut.accelerator);
  const hasToken = useSettingsStore((s) => s.settings.backend.token !== '');
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">You're all set</h1>
      <ol className="mt-5 space-y-3 text-sm">
        <li>1. Click into any text field.</li>
        <li className="flex flex-wrap items-center gap-1.5">2. Press {formatAccelerator(accelerator).map((k, i) => <Kbd key={i}>{k}</Kbd>)} and speak.</li>
        <li>3. Press it again — your text appears. Esc cancels.</li>
      </ol>
      {!hasToken && <p className="mt-5 text-sm text-muted">Add your access token in Settings → Backend before dictating.</p>}
      <p className="mt-5 text-sm text-muted">Find history, dictionary and settings in the main window any time.</p>
    </div>
  );
}
