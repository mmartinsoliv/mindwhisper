import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Button, Kbd } from '@/components';
import { formatAccelerator, isMac } from '@/features/dictation/accelerator';

const NAMED: Record<string, string> = { Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", Backquote: '`', BracketLeft: '[', BracketRight: ']', Backslash: '\\' };

function keyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return NAMED[code] ?? null;
}

const MODIFIER_CODES = /^(Shift|Control|Alt|Meta)(Left|Right)$/;

type KeyInfo = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

/** Builds an accelerator string accepted by `shortcut_register`, or null when the combination is unusable. */
export function acceleratorFromEvent(e: KeyInfo, mac: boolean = isMac()): string | null {
  const key = keyName(e.code);
  if (!key) return null;
  const mods = [e.ctrlKey && 'Control', e.metaKey && (mac ? 'Command' : 'Super'), e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean) as string[];
  const isFunctionKey = /^F\d+$/.test(key);
  if (mods.length === 0 && !isFunctionKey) return null; // a bare letter would hijack normal typing
  return [...mods, key].join('+');
}

interface Props { value: string; onChange(accelerator: string): Promise<void> | void; error?: string | null }

export function ShortcutCapture({ value, onChange, error }: Props) {
  const [capturing, setCapturing] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    e.preventDefault(); e.stopPropagation();
    if (e.code === 'Escape') { setCapturing(false); setHint(null); return; }
    const acc = acceleratorFromEvent(e.nativeEvent);
    if (!acc) {
      if (!MODIFIER_CODES.test(e.code)) setHint('Add Ctrl, Alt, Cmd or Shift'); // a modifier on its own is just the user building a combination
      return;
    }
    setHint(null);
    setCapturing(false);
    void onChange(acc);
  };
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-muted">Dictation shortcut</span>
      <div className="flex items-center gap-3">
        <span className="flex gap-1">{formatAccelerator(value).map((k, i) => <Kbd key={i}>{k}</Kbd>)}</span>
        {capturing ? (
          <button type="button" autoFocus aria-label="Press the new shortcut" onKeyDown={onKeyDown} onBlur={() => { setCapturing(false); setHint(null); }}
            className="h-9 rounded-control border border-accent px-3 text-sm text-accent">Press the new shortcut… (Esc to cancel)</button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => { setHint(null); setCapturing(true); }}>Change shortcut</Button>
        )}
      </div>
      {hint && <p role="status" className="mt-2 text-sm text-muted">{hint}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
