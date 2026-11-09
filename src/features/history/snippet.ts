/** Short, single-line excerpt of a dictation, used to tell otherwise identical icon buttons apart. */
export function snippet(text: string, max = 40): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}
