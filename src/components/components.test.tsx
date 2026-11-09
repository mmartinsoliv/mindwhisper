import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AudioWaveform, Button, IconButton, MicIcon, RecordingIndicator, Select, TextField, Toggle } from './index';
import { applyTheme } from '@/styles/theme';

describe('Button', () => {
  it('fires onClick and is disabled while loading', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<Button onClick={onClick} loading>Go</Button>);
    expect(screen.getByRole('button', { name: /Go/ })).toBeDisabled();
  });
});

describe('IconButton', () => {
  it('uses label as the accessible name', () => {
    render(<IconButton label="Stop"><MicIcon /></IconButton>);
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });
});

describe('Toggle', () => {
  it('is a keyboard-operable switch', async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Save history" description="Keep recent dictations" />);
    const sw = screen.getByRole('switch', { name: /Save history/ });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    sw.focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('Select and TextField', () => {
  it('Select reports the chosen value', async () => {
    const onChange = vi.fn();
    render(<Select label="Language" value="en" onChange={onChange} options={[{ value: 'en', label: 'English' }, { value: 'pt-BR', label: 'Português' }]} />);
    await userEvent.selectOptions(screen.getByLabelText('Language'), 'pt-BR');
    expect(onChange).toHaveBeenCalledWith('pt-BR');
  });
  it('TextField is labelled and reports typing', async () => {
    const onChange = vi.fn();
    render(<TextField label="Backend URL" value="" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Backend URL'), 'a');
    expect(onChange).toHaveBeenCalledWith('a');
  });
});

describe('RecordingIndicator and AudioWaveform', () => {
  it('exposes state to assistive tech', () => {
    render(<RecordingIndicator state="recording" />);
    expect(screen.getByRole('img', { name: /recording/i })).toBeInTheDocument();
  });
  it('renders the requested number of bars', () => {
    render(<AudioWaveform level={0.5} active bars={12} />);
    expect(screen.getByRole('img', { name: /audio level/i }).querySelectorAll('[data-bar]')).toHaveLength(12);
  });
});

describe('AudioWaveform history', () => {
  afterEach(() => vi.useRealTimers());
  const heights = () => Array.from(screen.getByRole('img', { name: /audio level/i }).querySelectorAll<HTMLElement>('[data-bar]')).map((b) => b.style.height);
  const tick = (n = 1) => act(() => { vi.advanceTimersByTime(70 * n); });

  it('rolls the history as new levels arrive, even when the level is steady', () => {
    vi.useFakeTimers();
    const { rerender } = render(<AudioWaveform level={1} active bars={4} />);
    expect(heights()).toEqual(['4px', '4px', '4px', '4px']);
    tick();
    expect(heights()).toEqual(['4px', '4px', '4px', '30px']);
    tick();
    expect(heights()).toEqual(['4px', '4px', '30px', '30px']);
    rerender(<AudioWaveform level={0} active bars={4} />);
    tick();
    expect(heights()).toEqual(['4px', '30px', '30px', '4px']);
  });

  it('decays to flat when inactive and pads to a larger bar count', () => {
    vi.useFakeTimers();
    const { rerender } = render(<AudioWaveform level={1} active bars={3} />);
    tick(3);
    expect(heights()).toEqual(['30px', '30px', '30px']);
    rerender(<AudioWaveform level={1} active={false} bars={3} />);
    tick(3);
    expect(heights()).toEqual(['4px', '4px', '4px']);
    rerender(<AudioWaveform level={1} active={false} bars={6} />);
    expect(heights()).toHaveLength(6);
    expect(new Set(heights())).toEqual(new Set(['4px']));
  });
});

describe('applyTheme', () => {
  it('sets data-theme for explicit themes and resolves system', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    applyTheme('system');
    expect(['light', 'dark']).toContain(document.documentElement.dataset.theme);
  });
});

describe('applyTheme system listener', () => {
  afterEach(() => vi.restoreAllMocks());
  it('removes the previous change listener on every call and follows OS changes', () => {
    const mql = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList);

    applyTheme('system');
    applyTheme('system');
    applyTheme('system');
    expect(mql.addEventListener).toHaveBeenCalledTimes(3);
    expect(mql.removeEventListener).toHaveBeenCalledTimes(2);
    const added = mql.addEventListener.mock.calls.map((c) => c[1]);
    expect(mql.removeEventListener.mock.calls.map((c) => c[1])).toEqual([added[0], added[1]]);

    mql.matches = true;
    (added[2] as () => void)();
    expect(document.documentElement.dataset.theme).toBe('dark');

    applyTheme('light');
    expect(mql.removeEventListener).toHaveBeenCalledTimes(3);
    expect(mql.removeEventListener.mock.calls[2]?.[1]).toBe(added[2]);
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
