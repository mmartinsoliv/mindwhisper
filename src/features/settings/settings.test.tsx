import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const cmd = vi.hoisted(() => ({
  shortcutRegister: vi.fn(async () => {}), shortcutUnregister: vi.fn(async () => {}),
  audioListDevices: vi.fn(async () => [{ id: 'mic-a', name: 'Mic A', isDefault: true }, { id: 'mic-b', name: 'Mic B', isDefault: false }]),
  openSystemSettings: vi.fn(async () => {}), checkPermissions: vi.fn(async () => ({ platform: 'macos', accessibility: 'granted' })), audioProbe: vi.fn(async () => {}),
}));
vi.mock('@/services/tauri/commands', async (orig) => ({ ...(await orig<typeof import('@/services/tauri/commands')>()), commands: cmd }));
const autostart = vi.hoisted(() => ({ enable: vi.fn(async () => {}), disable: vi.fn(async () => {}), isEnabled: vi.fn(async () => false) }));
vi.mock('@tauri-apps/plugin-autostart', () => autostart);

import { CommandError } from '@/services/tauri/commands';
import { MemoryKeyValueStore, setRepositories, SettingsRepository, HistoryRepository, DictionaryRepository, repositories } from '@/services/storage';
import { useSettingsStore } from '@/stores/settingsStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useDictionaryStore } from '@/stores/dictionaryStore';
import { DEFAULT_SETTINGS } from '@/types/settings';
import { App } from '@/app/App';
import { SettingsPage } from './SettingsPage';
import { acceleratorFromEvent } from './ShortcutCapture';

const ev = (o: Partial<KeyboardEvent>) => ({ key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o });

describe('acceleratorFromEvent', () => {
  it.each([
    [ev({ code: 'KeyD', key: 'd', ctrlKey: true, shiftKey: true }), true, 'Control+Shift+D'],
    [ev({ code: 'Space', key: ' ', metaKey: true, shiftKey: true }), true, 'Command+Shift+Space'],
    [ev({ code: 'Space', key: ' ', metaKey: true }), false, 'Super+Space'],
    [ev({ code: 'F9', key: 'F9' }), true, 'F9'],
    [ev({ code: 'Digit4', key: '4', altKey: true }), true, 'Alt+4'],
    [ev({ code: 'KeyA', key: 'a' }), true, null],               // a bare letter would hijack typing
    [ev({ code: 'ShiftLeft', key: 'Shift', shiftKey: true }), true, null], // modifier alone
    [ev({ code: 'Escape', key: 'Escape', ctrlKey: true }), true, null],
  ])('%#', (e, mac, expected) => { expect(acceleratorFromEvent(e as KeyboardEvent, mac)).toBe(expected); });
});

beforeEach(async () => {
  Object.values(cmd).forEach((f) => f.mockClear()); Object.values(autostart).forEach((f) => f.mockClear());
  setRepositories({ settings: new SettingsRepository(new MemoryKeyValueStore()), history: new HistoryRepository(new MemoryKeyValueStore()), dictionary: new DictionaryRepository(new MemoryKeyValueStore()) });
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true, backend: { url: 'http://x', token: 'secret' } }, loaded: true });
});
const s = () => useSettingsStore.getState().settings;

describe('SettingsPage', () => {
  it('renders every section from the brief', async () => {
    render(<SettingsPage />);
    for (const h of ['General', 'Text cleanup', 'Privacy and data', 'Appearance', 'Backend']) expect(screen.getByRole('heading', { name: h })).toBeInTheDocument();
  });
  it('persists language, style and the cleanup toggles; disables style when cleanup is off', async () => {
    render(<SettingsPage />);
    await userEvent.selectOptions(screen.getByLabelText('Language'), 'pt-BR');
    expect(s().language).toBe('pt-BR');
    await userEvent.selectOptions(screen.getByLabelText('Writing style'), 'professional');
    expect(s().cleanup.style).toBe('professional');
    expect(within5(screen.getByLabelText('Writing style'))).toEqual(['Preserve my words', 'Minimal cleanup', 'Professional', 'Casual', 'Concise']);
    await userEvent.click(screen.getByRole('switch', { name: /clean up text with ai/i }));
    expect(s().cleanup.enabled).toBe(false);
    expect(screen.getByLabelText('Writing style')).toBeDisabled();
    await userEvent.click(screen.getByRole('switch', { name: /remove filler words/i }));
    expect(s().cleanup.removeFillers).toBe(false);
    await userEvent.click(screen.getByRole('switch', { name: /automatic punctuation/i }));
    expect(s().cleanup.autoPunctuation).toBe(false);
  });
  it('lets the user pick a microphone from the native device list', async () => {
    render(<SettingsPage />);
    const sel = await screen.findByLabelText('Microphone');
    await vi.waitFor(() => expect(screen.getByRole('option', { name: /Mic B/ })).toBeInTheDocument());
    await userEvent.selectOptions(sel, 'mic-b');
    expect(s().microphoneId).toBe('mic-b');
    await userEvent.selectOptions(sel, '');
    expect(s().microphoneId).toBeNull();
  });
  it('registers a captured shortcut before saving it, and shows the error without saving when it is taken', async () => {
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('button', { name: /change shortcut/i }));
    fireEvent.keyDown(screen.getByRole('button', { name: /press the new shortcut/i }), { code: 'KeyD', key: 'd', ctrlKey: true, shiftKey: true });
    await vi.waitFor(() => expect(s().shortcut.accelerator).toBe('Control+Shift+D'));
    expect(cmd.shortcutRegister).toHaveBeenCalledWith('Control+Shift+D', 'toggle');

    cmd.shortcutRegister.mockRejectedValueOnce(new CommandError('shortcut_taken', 'Another app is already using this shortcut. Pick a different one.'));
    await userEvent.click(screen.getByRole('button', { name: /change shortcut/i }));
    fireEvent.keyDown(screen.getByRole('button', { name: /press the new shortcut/i }), { code: 'KeyE', key: 'e', ctrlKey: true, shiftKey: true });
    expect(await screen.findByRole('alert')).toHaveTextContent(/already using this shortcut/i);
    expect(s().shortcut.accelerator).toBe('Control+Shift+D');
  });
  it('Escape cancels shortcut capture without changes', async () => {
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('button', { name: /change shortcut/i }));
    fireEvent.keyDown(screen.getByRole('button', { name: /press the new shortcut/i }), { code: 'Escape', key: 'Escape' });
    expect(screen.getByRole('button', { name: /change shortcut/i })).toBeInTheDocument();
    expect(cmd.shortcutRegister).not.toHaveBeenCalled();
  });
  it('switches hold-to-talk mode and re-registers', async () => {
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('switch', { name: /hold to talk/i }));
    expect(s().shortcut.mode).toBe('hold');
    expect(cmd.shortcutRegister).toHaveBeenCalledWith(DEFAULT_SETTINGS.shortcut.accelerator, 'hold');
  });
  it('controls history, retention, clipboard restore, preview and launch at login', async () => {
    render(<SettingsPage />);
    await userEvent.selectOptions(screen.getByLabelText('Keep history for'), '7');
    expect(s().history.retentionDays).toBe(7);
    await userEvent.selectOptions(screen.getByLabelText('Keep history for'), 'forever');
    expect(s().history.retentionDays).toBeNull();
    await userEvent.click(screen.getByRole('switch', { name: /save dictation history/i }));
    expect(s().history.enabled).toBe(false);
    expect(screen.getByLabelText('Keep history for')).toBeDisabled();
    await userEvent.click(screen.getByRole('switch', { name: /restore my clipboard/i }));
    expect(s().restoreClipboard).toBe(false);
    await userEvent.click(screen.getByRole('switch', { name: /show text preview/i }));
    expect(s().showPreview).toBe(false);
    await userEvent.click(screen.getByRole('switch', { name: /launch at login/i }));
    expect(autostart.enable).toHaveBeenCalled();
    expect(s().startup.launchAtLogin).toBe(true);
  });
  it('discloses third-party providers and when audio leaves the device', () => {
    render(<SettingsPage />);
    expect(screen.getByText(/audio is sent to your mindwhisper server/i)).toBeInTheDocument();
    expect(screen.getByText(/third-party/i)).toBeInTheDocument();
    expect(screen.getByText(/never saved to disk/i)).toBeInTheDocument();
  });
  it('saves backend URL and token', async () => {
    render(<SettingsPage />);
    const url = screen.getByLabelText('Server URL'); await userEvent.clear(url); await userEvent.type(url, 'https://api.example.com');
    expect(s().backend.url).toBe('https://api.example.com');
    expect(screen.getByLabelText('Access token')).toHaveAttribute('type', 'password');
  });
  it('deletes all user data only after a second confirming click', async () => {
    await repositories.history.add({ id: 'a', createdAt: Date.now(), rawText: 'x', finalText: 'x', language: 'en', style: 'minimal', durationMs: 1 }, { enabled: true, retentionDays: 30 });
    await repositories.dictionary.add('Tauri');
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('button', { name: /delete all my data/i }));
    expect(await repositories.history.list()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: /yes, delete everything/i }));
    await vi.waitFor(async () => expect(await repositories.history.list()).toEqual([]));
    expect(await repositories.dictionary.list()).toEqual([]);
    expect(s().onboardingDone).toBe(false);
    expect(s().backend.token).toBe('');
    expect(cmd.shortcutUnregister).toHaveBeenCalled();
  });
});

describe('SettingsPage delete-all failures', () => {
  const seed = async () => {
    await repositories.history.add({ id: 'a', createdAt: Date.now(), rawText: 'x', finalText: 'x', language: 'en', style: 'minimal', durationMs: 1 }, { enabled: true, retentionDays: 30 });
  };
  it('shows an alert and keeps the confirm UI when wiping fails', async () => {
    await seed();
    const spy = vi.spyOn(repositories.settings, 'reset').mockRejectedValueOnce(new Error('disk'));
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('button', { name: /delete all my data/i }));
    await userEvent.click(screen.getByRole('button', { name: /yes, delete everything/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete everything. Try again.');
    expect(screen.getByRole('button', { name: /yes, delete everything/i })).toBeInTheDocument();
    expect(cmd.shortcutUnregister).toHaveBeenCalled();
    expect(cmd.shortcutRegister).toHaveBeenCalledWith(DEFAULT_SETTINGS.shortcut.accelerator, DEFAULT_SETTINGS.shortcut.mode);
    spy.mockRestore();
  });
  it('unregisters the shortcut first and wipes nothing when that fails', async () => {
    await seed();
    cmd.shortcutUnregister.mockRejectedValueOnce(new Error('native'));
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('button', { name: /delete all my data/i }));
    await userEvent.click(screen.getByRole('button', { name: /yes, delete everything/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete everything. Try again.');
    expect(await repositories.history.list()).toHaveLength(1);
    expect(s().backend.token).toBe('secret');
  });
  it('still shows the alert when restoring the shortcut also fails', async () => {
    await seed();
    const spy = vi.spyOn(repositories.settings, 'reset').mockRejectedValueOnce(new Error('disk'));
    cmd.shortcutRegister.mockRejectedValueOnce(new Error('native'));
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('button', { name: /delete all my data/i }));
    await userEvent.click(screen.getByRole('button', { name: /yes, delete everything/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete everything. Try again.');
    spy.mockRestore();
  });
  it('sends the user back to onboarding after everything is deleted', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await userEvent.click(screen.getByRole('button', { name: /delete all my data/i }));
    await userEvent.click(screen.getByRole('button', { name: /yes, delete everything/i }));
    expect(await screen.findByRole('heading', { name: /welcome/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(s().onboardingDone).toBe(false);
  });
});

describe('ShortcutCapture hints', () => {
  it('hints at a modifier for a bare key without saving, and blur cancels capture', async () => {
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('button', { name: /change shortcut/i }));
    const capture = screen.getByRole('button', { name: /press the new shortcut/i });
    fireEvent.keyDown(capture, { code: 'KeyA', key: 'a' });
    expect(screen.getByText(/add ctrl, alt, cmd or shift/i)).toBeInTheDocument();
    expect(cmd.shortcutRegister).not.toHaveBeenCalled();
    fireEvent.blur(capture);
    expect(screen.getByRole('button', { name: /change shortcut/i })).toBeInTheDocument();
  });
});

function within5(select: HTMLElement) { return Array.from(select.querySelectorAll('option')).map((o) => o.textContent); }
void useHistoryStore; void useDictionaryStore;
