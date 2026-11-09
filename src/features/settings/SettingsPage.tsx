import { useEffect, useState, type ReactNode } from 'react';
import { Button, Card, CommitTextField, Select, Toggle } from '@/components';
import { disable, enable } from '@tauri-apps/plugin-autostart';
import { commands } from '@/services/tauri/commands';
import { deleteAllUserData, emitChange, repositories } from '@/services/storage';
import { useDictionaryStore } from '@/stores/dictionaryStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { AudioDevice } from '@/types/ipc';
import type { CleanupStyle, Language, Settings } from '@/types/settings';
import { ShortcutCapture } from './ShortcutCapture';
import { useShortcutSettings } from './useShortcutSettings';

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'auto', label: 'Automatic' }, { value: 'en', label: 'English' }, { value: 'pt-BR', label: 'Português (Brasil)' },
];
const STYLE_OPTIONS: { value: CleanupStyle; label: string }[] = [
  { value: 'verbatim', label: 'Preserve my words' }, { value: 'minimal', label: 'Minimal cleanup' }, { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' }, { value: 'concise', label: 'Concise' },
];
const RETENTION_OPTIONS = [
  { value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'forever', label: 'Forever' },
];
const THEME_OPTIONS: { value: Settings['theme']; label: string }[] = [
  { value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <Card className="space-y-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {children}
      </Card>
    </section>
  );
}

export function SettingsPage() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const shortcut = useShortcutSettings();
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    commands.audioListDevices().then((d) => { if (live) setDevices(d); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const micId = settings.microphoneId ?? '';
  const micOptions = [
    { value: '', label: 'System default' },
    ...devices.map((d) => ({ value: d.id, label: d.name })),
    ...(micId && !devices.some((d) => d.id === micId) ? [{ value: micId, label: 'Unavailable microphone' }] : []),
  ];

  const setLaunchAtLogin = async (launchAtLogin: boolean) => {
    setStartupError(null);
    try {
      await (launchAtLogin ? enable() : disable());
      await update({ startup: { launchAtLogin } });
    } catch { setStartupError('Could not change the launch at login setting. Try again.'); }
  };

  const deleteEverything = async () => {
    setDeleting(true); setDeleteError(null);
    const { shortcut: previous } = useSettingsStore.getState().settings;
    try {
      await commands.shortcutUnregister(); // first: if this fails nothing has been wiped yet
      await deleteAllUserData(repositories);
      await Promise.all([useSettingsStore.getState().load(), useHistoryStore.getState().load(), useDictionaryStore.getState().load()]);
      await Promise.all([emitChange('settings'), emitChange('history'), emitChange('dictionary')]);
      setConfirmingDelete(false);
    } catch {
      // Best effort: put the shortcut back so the app matches the settings that are still saved.
      await commands.shortcutRegister(previous.accelerator, previous.mode).catch(() => {});
      setDeleteError('Could not delete everything. Try again.');
    }
    finally { setDeleting(false); }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Section title="General">
        <ShortcutCapture value={settings.shortcut.accelerator} onChange={shortcut.changeAccelerator} error={shortcut.error} />
        <Toggle label="Hold to talk" description="Hold the shortcut while speaking instead of pressing twice."
          checked={settings.shortcut.mode === 'hold'} onChange={(v) => void shortcut.changeMode(v ? 'hold' : 'toggle')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Microphone" value={micId} options={micOptions} onChange={(v) => void update({ microphoneId: v === '' ? null : v })} />
          <Select label="Language" value={settings.language} options={LANGUAGE_OPTIONS} onChange={(language) => void update({ language })} />
        </div>
        <Toggle label="Launch at login" checked={settings.startup.launchAtLogin} onChange={(v) => void setLaunchAtLogin(v)} />
        {startupError && <p role="alert" className="text-sm text-danger">{startupError}</p>}
      </Section>

      <Section title="Text cleanup">
        <Toggle label="Clean up text with AI" checked={settings.cleanup.enabled} onChange={(enabled) => void update({ cleanup: { enabled } })} />
        <SelectWithDisabled label="Writing style" value={settings.cleanup.style} options={STYLE_OPTIONS} disabled={!settings.cleanup.enabled}
          onChange={(style) => void update({ cleanup: { style } })} />
        <Toggle label="Remove filler words" checked={settings.cleanup.removeFillers} onChange={(removeFillers) => void update({ cleanup: { removeFillers } })} />
        <Toggle label="Automatic punctuation" checked={settings.cleanup.autoPunctuation} onChange={(autoPunctuation) => void update({ cleanup: { autoPunctuation } })} />
        <Toggle label="Show text preview" description="Show the recognized text in the overlay before it is inserted."
          checked={settings.showPreview} onChange={(showPreview) => void update({ showPreview })} />
      </Section>

      <Section title="Privacy and data">
        <Toggle label="Save dictation history" checked={settings.history.enabled} onChange={(enabled) => void update({ history: { enabled } })} />
        <SelectWithDisabled label="Keep history for" value={settings.history.retentionDays === null ? 'forever' : String(settings.history.retentionDays)}
          options={RETENTION_OPTIONS} disabled={!settings.history.enabled}
          onChange={(v) => void update({ history: { retentionDays: v === 'forever' ? null : Number(v) } })} />
        <Toggle label="Restore my clipboard after inserting" checked={settings.restoreClipboard} onChange={(restoreClipboard) => void update({ restoreClipboard })} />
        <div className="space-y-2 text-sm text-muted">
          <p>Audio is sent to your Mindwhisper server only while you dictate, and the server forwards it to a third-party speech-to-text provider. The recognized text is sent to your server and a third-party AI provider for cleanup (skipped when cleanup is off or set to Preserve my words).</p>
          <p>Audio is never saved to disk.</p>
          <p>Transcription history is stored only on this computer.</p>
        </div>
        {confirmingDelete ? (
          <div className="space-y-3 rounded-control border border-border bg-surface-2 p-4">
            <p className="text-sm">This removes your settings, history and dictionary, and returns you to setup.</p>
            <div className="flex gap-2">
              <Button variant="danger" loading={deleting} onClick={() => void deleteEverything()}>Yes, delete everything</Button>
              <Button variant="ghost" disabled={deleting} onClick={() => { setConfirmingDelete(false); setDeleteError(null); }}>Cancel</Button>
            </div>
            {deleteError && <p role="alert" className="text-sm text-danger">{deleteError}</p>}
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirmingDelete(true)}>Delete all my data</Button>
        )}
      </Section>

      <Section title="Appearance">
        <Select label="Theme" value={settings.theme} options={THEME_OPTIONS} onChange={(theme) => void update({ theme })} />
      </Section>

      <Section title="Backend">
        <CommitTextField label="Server URL" value={settings.backend.url} onCommit={(url) => void update({ backend: { url } })} />
        <div>
          <CommitTextField label="Access token" type="password" value={settings.backend.token} onCommit={(token) => void update({ backend: { token } })} />
          <p className="mt-1 text-xs text-muted">Provided by whoever runs your Mindwhisper server. Provider API keys never live in this app.</p>
        </div>
      </Section>
    </div>
  );
}

/** The kit `Select` has no `disabled` prop, so this wraps a native select with the same look. */
function SelectWithDisabled<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: { value: T; label: string }[]; onChange(v: T): void; disabled: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}
        className="h-10 w-full rounded-control border border-border-strong bg-surface px-3 text-sm text-text focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-60">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
