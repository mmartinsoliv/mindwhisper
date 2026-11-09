import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const sendCommand = vi.fn(async (_c?: unknown) => {});
vi.mock('@/services/dictation/bridge', () => ({ listenSnapshots: vi.fn(async () => () => {}), sendCommand: (c: unknown) => sendCommand(c) }));
const insertText = vi.fn(async () => ({ clipboardRestored: true }));
const mainShow = vi.fn(async () => {});
vi.mock('@/services/tauri/commands', async (orig) => ({ ...(await orig<typeof import('@/services/tauri/commands')>()), commands: { insertText: (...a: unknown[]) => insertText(...(a as [])), mainShow: () => mainShow() } }));
const hide = vi.fn(async () => {});
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ hide }) }));

import { MemoryKeyValueStore, setRepositories, SettingsRepository, HistoryRepository, DictionaryRepository, repositories } from '@/services/storage';
import { useSettingsStore } from '@/stores/settingsStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useDictionaryStore } from '@/stores/dictionaryStore';
import { useDictationStore } from '@/stores/dictationStore';
import { IDLE_SNAPSHOT } from '@/types/dictation';
import { DEFAULT_SETTINGS } from '@/types/settings';
import { App } from '@/app/App';
import { DictationPage } from './dictation/DictationPage';
import { HistoryPage } from './history/HistoryPage';
import { DictionaryPage } from './dictionary/DictionaryPage';
import { formatAccelerator } from './dictation/accelerator';
import { reinsertText } from './history/reinsert';

const on = { enabled: true, retentionDays: 30 };
const entry = (id: string, finalText: string, createdAt = Date.now()) => ({ id, createdAt, rawText: 'raw ' + finalText, finalText, language: 'en' as const, style: 'minimal' as const, durationMs: 1000 });

beforeEach(async () => {
  setRepositories({ settings: new SettingsRepository(new MemoryKeyValueStore()), history: new HistoryRepository(new MemoryKeyValueStore()), dictionary: new DictionaryRepository(new MemoryKeyValueStore()) });
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true }, loaded: true });
  useHistoryStore.setState({ entries: [], query: '' }); useDictionaryStore.setState({ entries: [] });
  useDictationStore.setState({ snapshot: IDLE_SNAPSHOT });
  sendCommand.mockClear(); insertText.mockClear(); hide.mockClear(); mainShow.mockClear();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => {}) }, configurable: true });
});

describe('formatAccelerator', () => {
  it('renders platform-specific key labels', () => {
    expect(formatAccelerator('CommandOrControl+Shift+Space', true)).toEqual(['⌘', '⇧', 'Space']);
    expect(formatAccelerator('CommandOrControl+Shift+Space', false)).toEqual(['Ctrl', 'Shift', 'Space']);
    expect(formatAccelerator('Alt+F9', true)).toEqual(['⌥', 'F9']);
  });
});

describe('App shell', () => {
  it('shows the four destinations and switches pages', async () => {
    render(<App />);
    const nav = screen.getByRole('navigation');
    for (const name of ['Dictation', 'History', 'Dictionary', 'Settings']) expect(within(nav).getByRole('button', { name })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Dictation' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(within(nav).getByRole('button', { name: 'Dictionary' }));
    expect(screen.getByRole('heading', { name: 'Dictionary' })).toBeInTheDocument();
  });
  it('renders onboarding instead of the shell until it is completed', () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: false }, loaded: true });
    render(<App />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});

describe('DictationPage', () => {
  it('has a record button that toggles dictation and reflects the live state', async () => {
    const { rerender } = render(<DictationPage />);
    await userEvent.click(screen.getByRole('button', { name: /start dictation/i }));
    expect(sendCommand).toHaveBeenCalledWith({ type: 'toggle' });
    useDictationStore.setState({ snapshot: { ...IDLE_SNAPSHOT, state: 'recording', sessionId: 's' } });
    rerender(<DictationPage />);
    expect(screen.getByRole('button', { name: /stop dictation/i })).toBeInTheDocument();
  });
  it('shows the shortcut guide and the five most recent results with a working copy button', async () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true } });
    for (let i = 1; i <= 6; i++) await repositories.history.add(entry('e' + i, 'Result ' + i, Date.now() + i), on);
    await useHistoryStore.getState().load();
    render(<DictationPage />);
    expect(screen.getByText('Space')).toBeInTheDocument();
    expect(screen.getAllByTestId('recent-item')).toHaveLength(5);
    expect(screen.getByText('Result 6')).toBeInTheDocument();
    expect(screen.queryByText('Result 1')).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /copy/i })[0]!);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Result 6');
  });
  it('shows an empty state before any dictation', () => {
    render(<DictationPage />);
    expect(screen.getByText(/no dictations yet/i)).toBeInTheDocument();
  });
});

describe('HistoryPage', () => {
  beforeEach(async () => {
    await repositories.history.add(entry('a', 'Alpha meeting notes', Date.now() + 2000), on);
    await repositories.history.add(entry('b', 'Beta release plan', Date.now() + 1000), on);
    await useHistoryStore.getState().load();
  });
  it('lists, searches, deletes and clears (two-step confirmation)', async () => {
    render(<HistoryPage />);
    expect(screen.getAllByTestId('history-item')).toHaveLength(2);
    await userEvent.type(screen.getByRole('searchbox', { name: /search history/i }), 'beta');
    await vi.waitFor(() => expect(screen.getAllByTestId('history-item')).toHaveLength(1));
    expect(screen.getByText('Beta release plan')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    await vi.waitFor(() => expect(screen.queryAllByTestId('history-item')).toHaveLength(0));
    useHistoryStore.getState().setQuery('');
    await vi.waitFor(() => expect(screen.getAllByTestId('history-item')).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: /clear all/i }));
    expect(await repositories.history.list()).toHaveLength(1); // first click only asks for confirmation
    await userEvent.click(screen.getByRole('button', { name: /confirm clear/i }));
    await vi.waitFor(() => expect(screen.queryAllByTestId('history-item')).toHaveLength(0));
    expect(await repositories.history.list()).toEqual([]);
  });
  it('gives each icon button a distinguishable name', () => {
    render(<HistoryPage />);
    expect(screen.getByRole('button', { name: 'Copy: Alpha meeting notes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reinsert: Beta release plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete: Alpha meeting notes' })).toBeInTheDocument();
  });
  it('shows a plain-language message with a next step when reinsert fails', async () => {
    insertText.mockRejectedValueOnce(new Error('enigo: raw internal failure'));
    render(<HistoryPage />);
    await userEvent.click(screen.getAllByRole('button', { name: /reinsert/i })[0]!);
    const alert = await screen.findByRole('alert', {}, { timeout: 2000 });
    expect(alert).toHaveTextContent(/couldn't paste into the app/i);
    expect(alert).not.toHaveTextContent(/enigo/i);
  });
  it('copies an entry', async () => {
    render(<HistoryPage />);
    await userEvent.click(screen.getAllByRole('button', { name: /copy/i })[0]!);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Alpha meeting notes');
  });
  it('explains when history is turned off', async () => {
    await repositories.history.clear(); await useHistoryStore.getState().load();
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true, history: { enabled: false, retentionDays: 30 } } });
    render(<HistoryPage />);
    expect(screen.getByText(/history is off/i)).toBeInTheDocument();
  });
});

describe('reinsertText', () => {
  it('hides the window, waits, inserts, and brings the window back only on failure', async () => {
    const calls: string[] = [];
    await reinsertText('hello', true, { hide: async () => { calls.push('hide'); }, sleep: async () => { calls.push('sleep'); }, insert: async () => { calls.push('insert'); return { clipboardRestored: true }; }, show: async () => { calls.push('show'); } });
    expect(calls).toEqual(['hide', 'sleep', 'insert']);
    const calls2: string[] = [];
    await expect(reinsertText('hello', true, { hide: async () => { calls2.push('hide'); }, sleep: async () => {}, insert: async () => { throw new Error('nope'); }, show: async () => { calls2.push('show'); } })).rejects.toThrow('nope');
    expect(calls2).toEqual(['hide', 'show']);
  });
});

describe('DictionaryPage', () => {
  it('adds a term with an optional spoken form, rejects blanks, and removes entries', async () => {
    render(<DictionaryPage />);
    expect(screen.getByRole('button', { name: /add term/i })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/^term$/i), 'Mindwhisper');
    await userEvent.type(screen.getByLabelText(/spoken as/i), 'mind whisper');
    await userEvent.click(screen.getByRole('button', { name: /add term/i }));
    await vi.waitFor(() => expect(screen.getByText('Mindwhisper')).toBeInTheDocument());
    expect(screen.getByText(/mind whisper/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^term$/i)).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: /remove mindwhisper/i }));
    await vi.waitFor(() => expect(screen.queryByText('Mindwhisper')).not.toBeInTheDocument());
  });
});
