import { useId } from 'react';

export function TextField({ label, value, onChange, type = 'text', placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; hint?: string }) {
  const hintId = useId();
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        aria-describedby={hint ? hintId : undefined}
        className="h-10 w-full rounded-control border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-muted focus-visible:border-accent" />
      {hint && <p id={hintId} className="mt-1 text-xs text-muted">{hint}</p>}
    </label>
  );
}
