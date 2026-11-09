import type { KeyboardEvent } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { LANGUAGES, type Language } from '@/types/settings';

const LABEL: Record<Language, string> = { auto: 'Automatic', en: 'English', 'pt-BR': 'Português (Brasil)' };

export function LanguageStep() {
  const language = useSettingsStore((s) => s.settings.language);
  const update = useSettingsStore((s) => s.update);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = LANGUAGES[(LANGUAGES.indexOf(language) + delta + LANGUAGES.length) % LANGUAGES.length]!;
    void update({ language: next });
    (e.currentTarget.parentElement?.querySelectorAll('button')[LANGUAGES.indexOf(next)] as HTMLElement | undefined)?.focus();
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Language</h1>
      <p className="mt-3 text-sm text-muted">Which language do you dictate in? Automatic detects it for you.</p>
      <div role="radiogroup" aria-label="Language" className="mt-6 space-y-2">
        {LANGUAGES.map((l) => {
          const checked = l === language;
          return (
            <button key={l} type="button" role="radio" aria-checked={checked} tabIndex={checked ? 0 : -1} onKeyDown={onKeyDown} onClick={() => void update({ language: l })}
              className={`flex w-full items-center justify-between rounded-control border px-4 py-3 text-left text-sm font-medium transition ${checked ? 'border-accent bg-surface-2' : 'border-border hover:bg-surface-2'}`}>
              {LABEL[l]}
              <span aria-hidden className={`size-4 rounded-full border-2 ${checked ? 'border-accent bg-accent' : 'border-border-strong'}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
