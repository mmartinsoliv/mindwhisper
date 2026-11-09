import type { DictionaryEntry } from '@/types/history';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-word, case-insensitive, Unicode-aware replacement. `spoken` → `term`; entries without `spoken` fix casing of `term`. */
export function applyDictionary(text: string, entries: DictionaryEntry[]): string {
  const rules = entries
    .map((e) => ({ from: (e.spoken?.trim() || e.term).trim(), to: e.term }))
    .filter((r) => r.from.length > 0)
    .sort((a, b) => b.from.length - a.from.length);
  let out = text;
  for (const r of rules) {
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${esc(r.from)}(?![\\p{L}\\p{N}_])`, 'giu'), () => r.to);
  }
  return out;
}

export function vocabularyFor(entries: DictionaryEntry[]): string[] {
  const seen = new Set<string>(); const out: string[] = [];
  for (const e of entries) {
    const t = e.term.trim();
    if (!t || t.length > 64 || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase()); out.push(t);
    if (out.length === 100) break;
  }
  return out;
}
