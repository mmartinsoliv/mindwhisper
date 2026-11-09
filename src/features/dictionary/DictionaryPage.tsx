import { useState, type FormEvent } from 'react';
import { Button, IconButton, TextField, XIcon } from '@/components';
import { useDictionaryStore } from '@/stores/dictionaryStore';

export function DictionaryPage() {
  const { entries, add, remove } = useDictionaryStore();
  const [term, setTerm] = useState('');
  const [spoken, setSpoken] = useState('');
  const blank = term.trim() === '';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (blank) return;
    await add(term.trim(), spoken.trim() || undefined);
    setTerm(''); setSpoken('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dictionary</h1>
        <p className="mt-1 text-sm text-muted">Words Mindwhisper should always spell your way.</p>
      </div>

      <form onSubmit={onSubmit} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <TextField label="Term" value={term} onChange={setTerm} />
        <TextField label="Spoken as (optional)" value={spoken} onChange={setSpoken} />
        <Button type="submit" disabled={blank}>Add term</Button>
      </form>

      {entries.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm text-muted">No custom words yet. Add names, product names or jargon.</p>
          <p className="mt-3 flex justify-center gap-2 text-xs text-muted" aria-hidden>
            <span className="rounded-full border border-border px-3 py-1">Kubernetes</span>
            <span className="rounded-full border border-border px-3 py-1">Figma</span>
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-control border border-border bg-surface px-4 py-2.5">
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{e.term}</span>
                {e.spoken && <span className="ml-2 text-muted">spoken as “{e.spoken}”</span>}
              </span>
              <IconButton label={`Remove ${e.term}`} title="Remove" onClick={() => void remove(e.id)}><XIcon className="size-4" /></IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
