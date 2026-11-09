import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Button } from '@/components';
import { commands } from '@/services/tauri/commands';
import { EVENTS, type AppError } from '@/types/ipc';

/** Tells the user that the global shortcut could not be registered, which would otherwise only be logged. */
export function ShortcutBanner({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    let alive = true;
    let off: (() => void) | undefined;
    // Starting inside a promise turns a synchronous throw (command missing) into the same quiet failure as a rejection.
    Promise.resolve().then(() => commands.shortcutStatus()).then((e) => { if (alive) setError(e); }, () => {});
    listen<AppError | null>(EVENTS.shortcutStatus, (e) => { if (alive) setError(e.payload ?? null); })
      .then((u) => { if (alive) off = u; else u(); }, () => {});
    return () => { alive = false; off?.(); };
  }, []);

  if (!error) return null;
  return (
    <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-control border border-danger bg-surface-2 p-4 text-sm">
      <p className="min-w-0 flex-1"><strong className="font-semibold">Dictation shortcut is off.</strong> {error.message}</p>
      <Button variant="ghost" onClick={onOpenSettings}>Change shortcut</Button>
    </div>
  );
}
