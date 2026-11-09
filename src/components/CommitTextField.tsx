import { useEffect, useRef, useState } from 'react';
import { TextField } from './TextField';

/** How long typing must pause before the value is saved. */
export const COMMIT_DELAY_MS = 600;

interface Props { label: string; value: string; onCommit: (v: string) => void; type?: string; placeholder?: string; hint?: string }

/**
 * A text field that keeps what is typed locally and calls `onCommit` once the user pauses, leaves the field,
 * or the field unmounts, so a half-typed server URL or token is never persisted and used by the next dictation.
 */
export function CommitTextField({ value, onCommit, ...rest }: Props) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const dirty = useRef(false);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Follow changes made elsewhere (another window) only while the user is not in the middle of typing.
  useEffect(() => {
    if (!dirty.current) { draftRef.current = value; setDraft(value); }
  }, [value]);

  const flush = () => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    commitRef.current(draftRef.current);
  };
  useEffect(() => flush, []); // commit a pending edit on unmount

  return (
    <div onBlur={flush}>
      <TextField
        {...rest}
        value={draft}
        onChange={(v) => {
          dirty.current = true;
          draftRef.current = v;
          setDraft(v);
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, COMMIT_DELAY_MS);
        }}
      />
    </div>
  );
}
