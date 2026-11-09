# Landing page and public release Implementation Plan

> **For agentic workers:** this plan is executed by teammates that `team8:run` dispatches from the shared task list. Read your own task section. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Mindwhisper downloadable for macOS and Windows 10/11 from a product page, with a hosted Cloudflare Worker backend.

**Architecture:** The desktop app gets release fixes (CSP, default backend URL, debounced backend fields, a visible startup shortcut failure). The Hono server gains a Cloudflare Worker entry with a Rate Limiting binding. GitHub Actions builds draft releases on `v*` tags. A static Vite page in `site/` resolves the latest release assets for the visitor's OS.

**Tech Stack:** Tauri 2, React 19, Vite 8, TypeScript 7, Vitest 5, Rust (tauri-plugin-global-shortcut), Hono 4, Wrangler, GitHub Actions with `tauri-apps/tauri-action@v0`.

**Spec:** `docs/team8/specs/2026-11-09-landing-and-release-design.md`

## Global Constraints

- Package manager is pnpm 10.16.1; Node 22.9 or newer (CI uses Node 24). The root, `server/` and `site/` are three separate pnpm packages, each with its own `pnpm-lock.yaml` and `pnpm install`.
- The build-time variable is named exactly `VITE_DEFAULT_BACKEND_URL`; the GitHub repository variable that feeds it is named exactly `DEFAULT_BACKEND_URL`. Fallback value when unset or blank: `http://127.0.0.1:8787`.
- The Cloudflare Worker is named `mindwhisper-api`; the rate-limit binding is named exactly `RATE_LIMITER` (30 requests per 60 seconds, keyed by token id); the Pages project is named `mindwhisper`.
- The Tauri event for startup shortcut status is exactly `shortcut://status`; the Tauri command is exactly `shortcut_status`.
- The GitHub repository is `mmartinsoliv/mindwhisper`. It is a single constant `REPO` in `site/src/config.ts`; nothing else hard-codes it.
- Release asset names come from `tauri-action` and are versioned (`Mindwhisper_<version>_aarch64.dmg`, `Mindwhisper_<version>_x64.dmg`, `Mindwhisper_<version>_x64-setup.exe`, `Mindwhisper_<version>_x64_en-US.msi`). Never link to a hard-coded version.
- No provider API key, token or personal email address appears in `src/`, `src-tauri/`, `site/`, workflows or docs. Provider keys exist only as Worker secrets.
- The release workflow creates a **draft** release. Nothing is published, deployed or pushed by any task; those steps belong to the owner and are written up in `docs/DEPLOY.md`.
- Page and docs copy are in English, plain, with no emojis, and never claim anything is verified that no one has run.
- Existing suites must stay green: `pnpm check`, `pnpm test:e2e`, `cd server && pnpm test && pnpm typecheck`, `cd src-tauri && cargo test`.
- Commits are by explicit path (`git add <paths>`), never `git add -A`, because teammates share one checkout. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File Structure

Tracks own disjoint files. **Track app** (teammate `app`): `src-tauri/tauri.conf.json`, `src/types/settings.ts`, `src/types/settings.test.ts`, `src/types/tauriConfig.test.ts`, `src/vite-env.d.ts`, `src/components/CommitTextField.tsx`, `src/components/CommitTextField.test.tsx`, `src/components/index.ts`, `src/features/settings/SettingsPage.tsx`, `src/features/onboarding/steps/TestStep.tsx`, `src-tauri/src/shortcuts/mod.rs`, `src-tauri/src/lib.rs`, `src/services/tauri/commands.ts`, `src/types/ipc.ts`, `src/app/App.tsx`, `src/app/ShortcutBanner.tsx`, `src/app/ShortcutBanner.test.tsx`, `e2e/fixtures.ts`, and in the last task `README.md`, `docs/PLATFORM-LIMITATIONS.md`, `docs/MANUAL-TEST.md`, `docs/DEPLOY.md`.

**Track infra** (teammate `infra`): `server/src/app.ts`, `server/src/worker.ts`, `server/src/workerEnv.ts`, `server/src/workerEnv.test.ts`, `server/src/middleware/rateLimitBinding.ts`, `server/src/middleware/rateLimitBinding.test.ts`, `server/wrangler.toml`, `server/.dev.vars.example`, `server/package.json`, `server/pnpm-lock.yaml`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`.

**Track site** (teammate `site`): everything under `site/`.

---

### Task 1: Release configuration in the app (CSP, ad-hoc signing, default backend URL)

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src/types/settings.ts`
- Modify: `src/vite-env.d.ts`
- Test: `src/types/settings.test.ts`
- Create test: `src/types/tauriConfig.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `DEFAULT_SETTINGS.backend.url` resolves from `import.meta.env.VITE_DEFAULT_BACKEND_URL` (blank or unset gives `http://127.0.0.1:8787`); `tauri.conf.json` has a non-null `app.security.csp` and `bundle.macOS.signingIdentity === "-"`; `resolveDefaultBackendUrl(raw: string | undefined): string` exported from `src/types/settings.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `src/types/settings.test.ts`, inside the existing top-level `describe('settings', ...)` block, before its closing `});`, and add `resolveDefaultBackendUrl` to the import on line 2:

```ts
  it('resolveDefaultBackendUrl uses the build variable and falls back to the local server', () => {
    expect(resolveDefaultBackendUrl(undefined)).toBe('http://127.0.0.1:8787');
    expect(resolveDefaultBackendUrl('')).toBe('http://127.0.0.1:8787');
    expect(resolveDefaultBackendUrl('   ')).toBe('http://127.0.0.1:8787');
    expect(resolveDefaultBackendUrl(' https://mindwhisper-api.example.workers.dev ')).toBe('https://mindwhisper-api.example.workers.dev');
  });
```

Create `src/types/tauriConfig.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const conf = JSON.parse(readFileSync(new URL('../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));

describe('tauri.conf.json release settings', () => {
  const csp: string = conf.app.security.csp;
  const directive = (name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' ')) ?? '';

  it('defines a content security policy', () => {
    expect(typeof csp).toBe('string');
    expect(directive('default-src')).toBe("default-src 'self'");
    expect(directive('script-src')).toBe("script-src 'self'");
  });
  it('lets the app reach Tauri IPC, any HTTPS backend and a local backend, and nothing else', () => {
    const connect = directive('connect-src').split(' ');
    for (const src of ["'self'", 'ipc:', 'http://ipc.localhost', 'https:', 'http://127.0.0.1:*', 'http://localhost:*']) expect(connect).toContain(src);
    expect(connect).not.toContain('*');
    expect(connect).not.toContain('http:');
  });
  it('signs macOS builds ad hoc so Apple Silicon will run them', () => {
    expect(conf.bundle.macOS.signingIdentity).toBe('-');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/types/settings.test.ts src/types/tauriConfig.test.ts`
Expected: FAIL. `resolveDefaultBackendUrl` is not exported, and `conf.app.security.csp` is `null` so `csp.split` throws.

- [ ] **Step 3: Implement the default backend URL**

In `src/vite-env.d.ts` add after the existing reference line:

```ts
interface ImportMetaEnv {
  /** Backend URL baked into release builds; unset or blank means the local development server. */
  readonly VITE_DEFAULT_BACKEND_URL?: string;
}
```

In `src/types/settings.ts`, add above `export const DEFAULT_SETTINGS` and change the `backend` default:

```ts
const LOCAL_BACKEND_URL = 'http://127.0.0.1:8787';

export function resolveDefaultBackendUrl(raw: string | undefined): string {
  const v = raw?.trim();
  return v ? v : LOCAL_BACKEND_URL;
}
```

```ts
  backend: { url: resolveDefaultBackendUrl(import.meta.env.VITE_DEFAULT_BACKEND_URL), token: '' },
```

- [ ] **Step 4: Implement the CSP and ad-hoc signing**

In `src-tauri/tauri.conf.json` replace `"security": { "csp": null },` with:

```json
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost https: http://127.0.0.1:* http://localhost:*",
      "devCsp": null
    },
```

and replace the `"bundle"` line with:

```json
  "bundle": {
    "active": true, "targets": "all",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"],
    "macOS": { "signingIdentity": "-", "minimumSystemVersion": "11.0" }
  }
```

Why `devCsp: null`: the Vite dev server needs inline scripts for React refresh and a websocket for HMR, so development keeps no policy; only built apps enforce the CSP. Why `https:` in `connect-src`: the backend URL is user-editable, so any HTTPS host must be reachable.

- [ ] **Step 5: Run the tests to verify they pass, then the full suite**

Run: `pnpm exec vitest run src/types/settings.test.ts src/types/tauriConfig.test.ts`
Expected: PASS.
Run: `pnpm check && pnpm build`
Expected: PASS (192 tests plus the new ones; the existing "documented defaults" test still sees `http://127.0.0.1:8787` because the variable is unset under Vitest).

- [ ] **Step 6: Build the app with the CSP and start it**

Run: `pnpm tauri build --debug --no-bundle`
Expected: compiles. Then start `src-tauri/target/debug/mindwhisper`, let it run 5 seconds, and quit it. Record in `verified` whether the main window rendered and whether the webview console showed a CSP violation (right-click Inspect, or run with `WEBKIT_INSPECTOR`-style tooling if you have it). If you cannot see the console, say so; do not claim the CSP is verified in a running webview.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/tauri.conf.json src/types/settings.ts src/types/settings.test.ts src/types/tauriConfig.test.ts src/vite-env.d.ts
git commit -m "feat: release CSP, ad-hoc macOS signing and build-time default backend URL" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Commit backend URL and token on idle, not on every keystroke

**Files:**
- Create: `src/components/CommitTextField.tsx`
- Create test: `src/components/CommitTextField.test.tsx`
- Modify: `src/components/index.ts`
- Modify: `src/features/settings/SettingsPage.tsx:143-146`
- Modify: `src/features/onboarding/steps/TestStep.tsx:47-48`

**Interfaces:**
- Consumes: `TextField` from `src/components/TextField.tsx` (`{ label, value, onChange, type?, placeholder?, hint? }`), unchanged.
- Produces: `CommitTextField({ label, value, onCommit, type?, placeholder?, hint? })` and `COMMIT_DELAY_MS = 600`, both exported from `src/components/CommitTextField.tsx`.

- [ ] **Step 1: Write the failing test**

Create `src/components/CommitTextField.test.tsx`. It relies on the label wrapping the input like the existing `TextField` (check `src/components/TextField.tsx`; if `getByLabelText` does not find the input, use `screen.getByRole('textbox')` or the password field's `container.querySelector('input')`).

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMIT_DELAY_MS, CommitTextField } from './CommitTextField';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const setup = (value = 'old') => {
  const onCommit = vi.fn();
  const view = render(<CommitTextField label="Server URL" value={value} onCommit={onCommit} />);
  return { onCommit, input: screen.getByLabelText('Server URL') as HTMLInputElement, view };
};

describe('CommitTextField', () => {
  it('shows what is typed immediately but commits only after the idle delay', () => {
    const { onCommit, input } = setup();
    fireEvent.change(input, { target: { value: 'https://a' } });
    fireEvent.change(input, { target: { value: 'https://ab' } });
    expect(input.value).toBe('https://ab');
    expect(onCommit).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(COMMIT_DELAY_MS - 1); });
    expect(onCommit).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('https://ab');
  });

  it('commits on blur without waiting', () => {
    const { onCommit, input } = setup();
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('x');
    act(() => { vi.advanceTimersByTime(COMMIT_DELAY_MS * 2); });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('commits a pending edit when it unmounts', () => {
    const { onCommit, input, view } = setup();
    fireEvent.change(input, { target: { value: 'pending' } });
    view.unmount();
    expect(onCommit).toHaveBeenCalledWith('pending');
  });

  it('does not commit when nothing was typed', () => {
    const { onCommit, input, view } = setup();
    fireEvent.blur(input);
    view.unmount();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('follows an outside change while the user is not typing', () => {
    const { view } = setup('one');
    view.rerender(<CommitTextField label="Server URL" value="two" onCommit={() => {}} />);
    expect((screen.getByLabelText('Server URL') as HTMLInputElement).value).toBe('two');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/components/CommitTextField.test.tsx`
Expected: FAIL with "Failed to resolve import ./CommitTextField".

- [ ] **Step 3: Implement the component**

Create `src/components/CommitTextField.tsx`:

```tsx
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
```

Add one line to `src/components/index.ts` (match the style of its existing lines): `export { CommitTextField, COMMIT_DELAY_MS } from './CommitTextField';`

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/components/CommitTextField.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Use it in Settings and onboarding**

In `src/features/settings/SettingsPage.tsx` replace the two `TextField`s in the "Backend" section (lines 143 and 145) with:

```tsx
        <CommitTextField label="Server URL" value={settings.backend.url} onCommit={(url) => void update({ backend: { url } })} />
        <div>
          <CommitTextField label="Access token" type="password" value={settings.backend.token} onCommit={(token) => void update({ backend: { token } })} />
```

In `src/features/onboarding/steps/TestStep.tsx` replace lines 47 and 48 the same way (`backend.url`, `backend.token`; keep any `hint` or other props the original line 48 carries, only swap `TextField` for `CommitTextField` and `onChange` for `onCommit`). Update each file's import so `CommitTextField` comes from the same module the file already imports `TextField` from (`@/components`), and remove `TextField` from the import if it is now unused.

- [ ] **Step 6: Run everything that can be affected**

Run: `pnpm check && pnpm test:e2e`
Expected: PASS. If an existing test or spec typed into these fields and checked persistence immediately, make it wait for the commit instead (`fireEvent.blur` in Vitest, or `await page.getByLabel('Server URL').blur()` in Playwright); only edit `src/features/settings/settings.test.tsx`, `src/features/onboarding/onboarding.test.tsx`, `e2e/settings.spec.ts` or `e2e/onboarding.spec.ts`, and say which in `verified`.

- [ ] **Step 7: Commit**

```bash
git add src/components/CommitTextField.tsx src/components/CommitTextField.test.tsx src/components/index.ts src/features/settings/SettingsPage.tsx src/features/onboarding/steps/TestStep.tsx
git commit -m "fix: save backend URL and token on idle or blur, not on every keystroke" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(Add any test or spec file you had to change to the `git add` line.)

### Task 3: Show a startup shortcut failure in the main window

**Files:**
- Modify: `src-tauri/src/shortcuts/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/services/tauri/commands.ts`
- Modify: `src/types/ipc.ts`
- Modify: `src/app/App.tsx`
- Create: `src/app/ShortcutBanner.tsx`
- Create test: `src/app/ShortcutBanner.test.tsx`
- Modify: `e2e/fixtures.ts`
- Modify only if it lists every command wrapper: `src/services/tauri/commands.test.ts`

**Interfaces:**
- Consumes: `AppError` from `src/types/ipc.ts` (`{ code: string; message: string }`).
- Produces: Rust command `shortcut_status() -> Option<AppError>`; Rust function `record_result(slot: &Mutex<Option<AppError>>, result: &CmdResult<()>)`; TypeScript `commands.shortcutStatus(): Promise<AppError | null>`; `EVENTS.shortcutStatus = 'shortcut://status'` (payload `AppError | null`); `<ShortcutBanner onOpenSettings={() => void} />`.

- [ ] **Step 1: Write the failing Rust test**

In `src-tauri/src/shortcuts/mod.rs`, inside the existing `#[cfg(test)] mod tests`, add (it needs `AppError` and `CmdResult` from the parent via the existing `use super::*;`):

```rust
    #[test]
    fn record_result_keeps_the_last_error_and_clears_it_on_success() {
        let slot: Mutex<Option<AppError>> = Mutex::new(None);
        record_result(&slot, &Err(AppError::new("shortcut_taken", "Another app is already using this shortcut. Pick a different one.")));
        assert_eq!(lock(&slot).as_ref().map(|e| e.code.as_str()), Some("shortcut_taken"));
        record_result(&slot, &Ok(()));
        assert!(lock(&slot).is_none());
    }
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd src-tauri && cargo test shortcuts::tests::record_result`
Expected: FAIL to compile, "cannot find function `record_result`".

- [ ] **Step 3: Implement the Rust side**

In `src-tauri/src/shortcuts/mod.rs`:

1. Change the registry to hold the last registration error:

```rust
#[derive(Default)]
pub struct ShortcutRegistry { current: Mutex<Option<ActiveShortcut>>, cancel: Mutex<Option<Shortcut>>, last_error: Mutex<Option<AppError>> }
```

2. Add below `emit_action`:

```rust
const STATUS_EVENT: &str = "shortcut://status";

/// Remembers the outcome of the latest registration so a window that was not listening at the time can ask for it.
pub fn record_result(slot: &Mutex<Option<AppError>>, result: &CmdResult<()>) {
    *lock(slot) = result.as_ref().err().cloned();
}
```

3. Rename the body of `shortcut_register` into a helper and make the command wrap it. Replace the whole `shortcut_register` function with:

```rust
fn register_inner(app: &AppHandle, reg: &ShortcutRegistry, accelerator: &str, mode: &str) -> CmdResult<()> {
    let mode = ShortcutMode::parse(mode)?;
    let shortcut = parse_accelerator(accelerator)?;
    let gs = app.global_shortcut();
    let mut cur = lock(&reg.current);
    match plan_register(cur.as_ref().map(|c| c.shortcut), shortcut) {
        RegisterPlan::UpdateModeOnly => {
            if let Some(c) = cur.as_ref() { *lock(&c.gate) = ShortcutGate::new(mode); }
        }
        RegisterPlan::RegisterNew { replace } => {
            let gate = Arc::new(Mutex::new(ShortcutGate::new(mode)));
            let handler_gate = gate.clone();
            // On failure `?` returns before touching `cur`, so the previous shortcut stays registered.
            gs.on_shortcut(shortcut, move |app, _sc, event| {
                if let Some(a) = lock(&handler_gate).handle(event.state(), Instant::now()) { emit_action(app, a); }
            }).map_err(map_register_err)?;
            if let Some(old) = replace { let _ = gs.unregister(old); }
            *cur = Some(ActiveShortcut { shortcut, gate });
        }
    }
    Ok(())
}

#[tauri::command]
pub fn shortcut_register(app: AppHandle, reg: State<ShortcutRegistry>, accelerator: String, mode: String) -> CmdResult<()> {
    let result = register_inner(&app, &reg, &accelerator, &mode);
    record_result(&reg.last_error, &result);
    let _ = app.emit(STATUS_EVENT, result.as_ref().err());
    result
}

#[tauri::command]
pub fn shortcut_status(reg: State<ShortcutRegistry>) -> Option<AppError> {
    lock(&reg.last_error).clone()
}
```

4. In `shortcut_unregister`, clear the status too: add `*lock(&reg.last_error) = None;` as the first line of its body.

In `src-tauri/src/lib.rs` add `shortcuts::shortcut_status,` to the `generate_handler!` list, after `shortcuts::shortcut_register, shortcuts::shortcut_unregister,`.

- [ ] **Step 4: Run the Rust tests**

Run: `cd src-tauri && cargo test && cargo check`
Expected: PASS (37 existing plus 1 new, 1 ignored).

- [ ] **Step 5: Write the failing frontend test**

Add to `src/types/ipc.ts`, inside `EVENTS`, before `} as const;`: `  shortcutStatus: 'shortcut://status',`

Add to `src/services/tauri/commands.ts` inside `commands`, after `shortcutUnregister`: `  shortcutStatus: () => call<AppError | null>('shortcut_status'),`

Create `src/app/ShortcutBanner.test.tsx`:

```tsx
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const status = vi.fn();
let onStatus: ((e: { payload: unknown }) => void) | undefined;
vi.mock('@/services/tauri/commands', () => ({ commands: { shortcutStatus: () => status() } }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_name: string, cb: (e: { payload: unknown }) => void) => { onStatus = cb; return () => { onStatus = undefined; }; }),
}));

import { ShortcutBanner } from './ShortcutBanner';

beforeEach(() => { status.mockReset(); onStatus = undefined; });

describe('ShortcutBanner', () => {
  it('shows nothing when the shortcut registered', async () => {
    status.mockResolvedValue(null);
    const { container } = render(<ShortcutBanner onOpenSettings={() => {}} />);
    await waitFor(() => expect(status).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the failure found at startup and opens Settings', async () => {
    status.mockResolvedValue({ code: 'shortcut_taken', message: 'Another app is already using this shortcut. Pick a different one.' });
    const open = vi.fn();
    render(<ShortcutBanner onOpenSettings={open} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Another app is already using this shortcut');
    await userEvent.click(screen.getByRole('button', { name: /change shortcut/i }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('reacts to a status event and clears when the shortcut recovers', async () => {
    status.mockResolvedValue(null);
    render(<ShortcutBanner onOpenSettings={() => {}} />);
    await waitFor(() => expect(onStatus).toBeDefined());
    act(() => { onStatus!({ payload: { code: 'shortcut_invalid', message: 'Not a valid shortcut.' } }); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Not a valid shortcut.');
    act(() => { onStatus!({ payload: null }); });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('stays quiet when the status command fails', async () => {
    status.mockRejectedValue(new Error('boom'));
    const { container } = render(<ShortcutBanner onOpenSettings={() => {}} />);
    await waitFor(() => expect(status).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm exec vitest run src/app/ShortcutBanner.test.tsx`
Expected: FAIL with "Failed to resolve import ./ShortcutBanner".

- [ ] **Step 7: Implement the banner and mount it**

Create `src/app/ShortcutBanner.tsx` (use the kit's `Button` from `@/components`; read `src/components/Button.tsx` for its `variant` names and pick the secondary or ghost one):

```tsx
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
    commands.shortcutStatus().then((e) => { if (alive) setError(e); }, () => {});
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
```

In `src/app/App.tsx` add `import { ShortcutBanner } from './ShortcutBanner';` and render it as the first child inside `<div className="mx-auto max-w-3xl">`:

```tsx
          {route !== 'settings' && <ShortcutBanner onOpenSettings={() => setRoute('settings')} />}
```

In `e2e/fixtures.ts` allow the new command: add `shortcut_status: {},` to the `shapes` object (next to `shortcut_unregister: {},`), and add `case 'shortcut_status': return null;` to the `switch (cmd)` in `invoke`.

- [ ] **Step 8: Run everything**

Run: `pnpm exec vitest run src/app/ShortcutBanner.test.tsx && pnpm check && pnpm build && pnpm test:e2e`
Expected: PASS. If `src/services/tauri/commands.test.ts` enumerates the command wrappers, add `shortcut_status` there too (you own that file's expectations only for this command).

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/shortcuts/mod.rs src-tauri/src/lib.rs src/services/tauri/commands.ts src/types/ipc.ts src/app/App.tsx src/app/ShortcutBanner.tsx src/app/ShortcutBanner.test.tsx e2e/fixtures.ts
git commit -m "feat: show a startup shortcut registration failure in the main window" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(Add `src/services/tauri/commands.test.ts` if you changed it.)

### Task 4: Hosted API as a Cloudflare Worker

**Files:**
- Modify: `server/src/app.ts`
- Create: `server/src/middleware/rateLimitBinding.ts`
- Create test: `server/src/middleware/rateLimitBinding.test.ts`
- Create: `server/src/workerEnv.ts`
- Create test: `server/src/workerEnv.test.ts`
- Create: `server/src/worker.ts`
- Create: `server/wrangler.toml`
- Create: `server/.dev.vars.example`
- Modify: `server/package.json`, `server/pnpm-lock.yaml`

**Interfaces:**
- Consumes: `createApp(deps)` from `server/src/app.ts`, `loadConfig(env)` from `server/src/config.ts` (takes `Record<string, string | undefined>`), `buildProviders(config)` from `server/src/providers/index.ts`, `HttpError(status, code, message)` from `server/src/middleware/errors.ts`.
- Produces: `createApp(deps: { config; stt; llm; limiter?: MiddlewareHandler })`; `rateLimitBinding(binding: RateLimitBinding): MiddlewareHandler`; `interface RateLimitBinding { limit(opts: { key: string }): Promise<{ success: boolean }> }`; `stringVars(env: Record<string, unknown>): Record<string, string>`; `assertProductionConfig(config: Config): void` (throws when either provider is `mock`); default export `{ fetch }` from `server/src/worker.ts`.

- [ ] **Step 1: Write the failing tests**

Create `server/src/middleware/rateLimitBinding.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import type { Config } from '../config';
import { MockLlmProvider, MockSttProvider } from '../providers/mock';
import { rateLimitBinding, type RateLimitBinding } from './rateLimitBinding';

const config: Config = { port: 0, appTokens: ['tok-1'], rateLimitPerMin: 1000, sttProvider: 'mock', openaiApiKey: undefined,
  sttModel: 'm', llmProvider: 'mock', anthropicApiKey: undefined, llmModel: 'm', geminiApiKey: undefined };
const post = (app: ReturnType<typeof createApp>) =>
  app.request('/v1/cleanup', { method: 'POST', headers: { Authorization: 'Bearer tok-1', 'Content-Type': 'application/json' }, body: '{}' });

describe('rateLimitBinding', () => {
  it('asks the binding once per request, keyed by the token id, and lets allowed requests through', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const app = createApp({ config, stt: new MockSttProvider(), llm: new MockLlmProvider(), limiter: rateLimitBinding({ limit } satisfies RateLimitBinding) });
    const res = await post(app);
    expect(res.status).not.toBe(429);
    expect(limit).toHaveBeenCalledTimes(1);
    const key = (limit.mock.calls[0] as unknown as [{ key: string }])[0].key;
    expect(key).toMatch(/^[0-9a-f]{16}$/); // auth middleware's tokenId, never the raw token
    expect(key).not.toContain('tok-1');
  });

  it('answers 429 rate_limited when the binding refuses', async () => {
    const app = createApp({ config, stt: new MockSttProvider(), llm: new MockLlmProvider(), limiter: rateLimitBinding({ limit: async () => ({ success: false }) }) });
    const res = await post(app);
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe('rate_limited');
  });

  it('is used instead of the in-memory limiter when provided', async () => {
    const app = createApp({ config: { ...config, rateLimitPerMin: 1 }, stt: new MockSttProvider(), llm: new MockLlmProvider(), limiter: async (_c, next) => { await next(); } });
    expect((await post(app)).status).not.toBe(429);
    expect((await post(app)).status).not.toBe(429); // the built-in limiter (1 per minute) would have refused this one
  });
});
```

Create `server/src/workerEnv.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Config } from './config';
import { assertProductionConfig, stringVars } from './workerEnv';

describe('stringVars', () => {
  it('keeps string vars and secrets and drops bindings and other non-strings', () => {
    expect(stringVars({ APP_TOKENS: 'a,b', STT_PROVIDER: 'openai', RATE_LIMITER: { limit() {} }, N: 3, U: undefined, B: true }))
      .toEqual({ APP_TOKENS: 'a,b', STT_PROVIDER: 'openai' });
  });
});

describe('assertProductionConfig', () => {
  const base: Config = { port: 0, appTokens: ['t'], rateLimitPerMin: 30, sttProvider: 'openai', openaiApiKey: 'k',
    sttModel: 'm', llmProvider: 'anthropic', anthropicApiKey: 'k', llmModel: 'm', geminiApiKey: undefined };
  it('accepts real providers', () => { expect(() => assertProductionConfig(base)).not.toThrow(); });
  it('refuses a mock speech or text provider so a missing variable never serves fake transcripts', () => {
    expect(() => assertProductionConfig({ ...base, sttProvider: 'mock' })).toThrow(/STT_PROVIDER/);
    expect(() => assertProductionConfig({ ...base, llmProvider: 'mock' })).toThrow(/LLM_PROVIDER/);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && pnpm exec vitest run src/middleware/rateLimitBinding.test.ts src/workerEnv.test.ts`
Expected: FAIL, modules `./rateLimitBinding` and `./workerEnv` not found.

- [ ] **Step 3: Implement the middleware and the injection point**

Create `server/src/middleware/rateLimitBinding.ts`:

```ts
import type { MiddlewareHandler } from 'hono';
import { HttpError } from './errors';

/** The shape of a Cloudflare Workers Rate Limiting binding. */
export interface RateLimitBinding { limit(opts: { key: string }): Promise<{ success: boolean }> }

/** Same contract as `rateLimit`, but the counting lives in Cloudflare, so it holds across isolates and restarts. */
export function rateLimitBinding(binding: RateLimitBinding): MiddlewareHandler {
  return async (c, next) => {
    const key = (c.get('tokenId') as string | undefined) ?? 'anon';
    const { success } = await binding.limit({ key });
    if (!success) throw new HttpError(429, 'rate_limited', 'Too many requests. Wait a moment and try again.');
    await next();
  };
}
```

In `server/src/app.ts` change the imports and the two lines that use the limiter:

```ts
import type { MiddlewareHandler } from 'hono';
```
```ts
export function createApp(deps: { config: Config; stt: SttProvider; llm: LlmProvider; limiter?: MiddlewareHandler }) {
```
```ts
  app.use('/v1/*', auth(deps.config.appTokens), deps.limiter ?? rateLimit(deps.config.rateLimitPerMin));
```

(`Hono` is already imported from `'hono'` on line 1; merge the type import into it: `import { Hono, type MiddlewareHandler } from 'hono';`.)

- [ ] **Step 4: Implement the Worker helpers and entry**

Create `server/src/workerEnv.ts`:

```ts
import type { Config } from './config';

/** Worker `env` mixes variables, secrets (strings) and bindings (objects); `loadConfig` only understands strings. */
export function stringVars(env: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => typeof e[1] === 'string'));
}

/** `loadConfig` defaults both providers to `mock`; on a public Worker that would silently serve fake transcripts. */
export function assertProductionConfig(config: Config): void {
  if (config.sttProvider === 'mock') throw new Error('STT_PROVIDER must be set to a real provider on the Worker');
  if (config.llmProvider === 'mock') throw new Error('LLM_PROVIDER must be set to a real provider on the Worker');
}
```

Create `server/src/worker.ts`:

```ts
import type { ExecutionContext } from 'hono';
import { createApp } from './app';
import { loadConfig } from './config';
import { rateLimitBinding, type RateLimitBinding } from './middleware/rateLimitBinding';
import { buildProviders } from './providers';
import { assertProductionConfig, stringVars } from './workerEnv';

interface Env { RATE_LIMITER: RateLimitBinding; [name: string]: unknown }

let app: ReturnType<typeof createApp> | undefined;

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    if (!app) {
      const config = loadConfig(stringVars(env));
      assertProductionConfig(config);
      app = createApp({ config, ...buildProviders(config), limiter: rateLimitBinding(env.RATE_LIMITER) });
    }
    return app.fetch(request, env, ctx);
  },
};
```

If `ExecutionContext` is not exported by `hono` in the installed version, declare it locally in this file as `interface ExecutionContext { waitUntil(p: Promise<unknown>): void; passThroughOnException(): void }`.

- [ ] **Step 5: Run the tests and the typecheck**

Run: `cd server && pnpm test && pnpm typecheck`
Expected: PASS (38 existing plus the new ones), typecheck clean.

- [ ] **Step 6: Add Wrangler configuration**

Create `server/wrangler.toml`:

```toml
name = "mindwhisper-api"
main = "src/worker.ts"
compatibility_date = "2026-10-01"
compatibility_flags = ["nodejs_compat"]

# Non-secret settings. Secrets (APP_TOKENS, OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY) are set with
# `wrangler secret put`, never written here.
[vars]
STT_PROVIDER = "openai"
LLM_PROVIDER = "anthropic"

[[ratelimits]]
name = "RATE_LIMITER"
namespace_id = "1001"
simple = { limit = 30, period = 60 }
```

Create `server/.dev.vars.example`:

```
# Copy to .dev.vars for `pnpm worker:dev`. Never commit .dev.vars.
APP_TOKENS=dev-token
STT_PROVIDER=openai
OPENAI_API_KEY=
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=
```

Install Wrangler and add scripts:

Run: `cd server && pnpm add -D wrangler`

In `server/package.json` `scripts` add:

```json
    "worker:dev": "wrangler dev",
    "worker:check": "wrangler deploy --dry-run --outdir .wrangler/dry-run",
    "worker:deploy": "wrangler deploy"
```

- [ ] **Step 7: Verify the Worker bundles and answers**

Run: `cd server && pnpm worker:check`
Expected: exits 0 and reports the bundle size with the `RATE_LIMITER` binding listed. If Wrangler rejects the `[[ratelimits]]` syntax, read `pnpm exec wrangler --help` and the Cloudflare "Rate Limiting binding" page for the installed version, fix the table, and say what changed in `verified`.
Then, with a throwaway `server/.dev.vars` (gitignored) holding `APP_TOKENS=dev-token`, `STT_PROVIDER=openai`, `OPENAI_API_KEY=x`, `LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=x`, run `pnpm worker:dev` in the background and check:
`curl -s localhost:8787/health` gives `{"ok":true}`; `curl -s -o /dev/null -w "%{http_code}" -X POST localhost:8787/v1/cleanup` gives `401`. Stop the dev server and delete `server/.dev.vars`. (Wrangler may print a different port; use it.) If `wrangler dev` cannot start in this environment, say so in `verified` and rely on the dry run.

- [ ] **Step 8: Commit**

```bash
git add server/src/app.ts server/src/worker.ts server/src/workerEnv.ts server/src/workerEnv.test.ts server/src/middleware/rateLimitBinding.ts server/src/middleware/rateLimitBinding.test.ts server/wrangler.toml server/.dev.vars.example server/package.json server/pnpm-lock.yaml
git commit -m "feat(server): run the API as a Cloudflare Worker with a rate limit binding" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: CI and release workflows

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: the repository variable `DEFAULT_BACKEND_URL` (set by the owner; may be unset) and the script names `pnpm check`, `pnpm build`, `pnpm --dir server test`, `pnpm --dir server typecheck`.
- Produces: on a pushed tag `v*`, a draft GitHub Release named `Mindwhisper <tag>` with a macOS Apple Silicon `.dmg`, a macOS Intel `.dmg`, and a Windows `.exe` (NSIS) and `.msi`.

- [ ] **Step 1: Write the CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  app:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
      - run: pnpm build

  server:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: server
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { package_json_file: package.json, run_install: false }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm, cache-dependency-path: server/pnpm-lock.yaml }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm typecheck
      - run: pnpm worker:check

  site:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: site
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { package_json_file: package.json, run_install: false }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm, cache-dependency-path: site/pnpm-lock.yaml }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm build
```

Note for the `server` and `site` jobs: `pnpm/action-setup` must find the pnpm version. `package_json_file: package.json` is resolved against the workspace root, not `working-directory`, so the root `package.json` (`packageManager: pnpm@10.16.1`) is the one read, and all three packages use that version. `site/package.json` (Task 6) also carries the same `packageManager` value. `server/package.json` does not: if you want it to, add `"packageManager": "pnpm@10.16.1"` there (you own that file).

- [ ] **Step 2: Write the release workflow**

Create `.github/workflows/release.yml`:

```yaml
name: release

on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - { name: macOS (Apple Silicon), os: macos-latest, args: '--target aarch64-apple-darwin', rust_targets: 'aarch64-apple-darwin' }
          - { name: macOS (Intel), os: macos-latest, args: '--target x86_64-apple-darwin', rust_targets: 'x86_64-apple-darwin' }
          - { name: Windows, os: windows-latest, args: '', rust_targets: '' }
    name: build (${{ matrix.name }})
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.rust_targets }}
      - uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'
      - run: pnpm install --frozen-lockfile
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # Optional repository variable (Settings > Secrets and variables > Actions > Variables).
          # Unset or blank leaves the app pointing at http://127.0.0.1:8787.
          VITE_DEFAULT_BACKEND_URL: ${{ vars.DEFAULT_BACKEND_URL }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'Mindwhisper ${{ github.ref_name }}'
          releaseBody: 'Unsigned build. See the install steps on the download page for the first-launch warning on macOS and Windows.'
          releaseDraft: true
          prerelease: false
          args: ${{ matrix.args }}
```

- [ ] **Step 3: Validate the YAML and the references**

Run: `for f in .github/workflows/ci.yml .github/workflows/release.yml; do ruby -ryaml -e 'YAML.load_file(ARGV[0]); puts "ok #{ARGV[0]}"' "$f"; done`
Expected: `ok` for both files.
Run: `grep -n "worker:check\|\"check\"\|\"build\"\|\"test\"" package.json server/package.json`
Expected: every script the workflows call exists (`pnpm check`, `pnpm build` at the root; `pnpm test`, `pnpm typecheck`, `pnpm worker:check` in `server/`; `pnpm test`, `pnpm build` in `site/` is Task 6's deliverable, so only confirm it once Task 6 is done, or say it is pending).
If `actionlint` is installed (`command -v actionlint`), run `actionlint` as well; do not install it.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/release.yml
git commit -m "ci: check on push and build draft macOS and Windows releases on v* tags" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Nothing is pushed and no tag is created by this task. The workflows cannot be exercised until the owner pushes the repository; say so in `verified`.

### Task 6: Landing page

**Files:**
- Create: `site/package.json`, `site/tsconfig.json`, `site/vite.config.ts`, `site/index.html`
- Create: `site/src/config.ts`, `site/src/download.ts`, `site/src/main.ts`, `site/src/styles.css`
- Create test: `site/src/download.test.ts`
- Create: `site/public/icon.png` (copy of `src-tauri/icons/icon.png`)

**Interfaces:**
- Consumes: nothing from other tasks (release asset name patterns are in Global Constraints).
- Produces: `detectOs(ua: string): 'mac' | 'windows' | 'other'`; `type DownloadId = 'mac-arm' | 'mac-intel' | 'windows'`; `pickDownloads(assets: ReleaseAsset[]): Download[]`; `interface ReleaseAsset { name: string; browser_download_url: string }`; `interface Download { id: DownloadId; label: string; url: string }`; constants `REPO`, `RELEASES_URL`, `ACCESS_REQUEST_URL` in `site/src/config.ts`; `pnpm --dir site build` emits `site/dist/`; also `primaryFor(os, downloads)` and `loadDownloads(fetchFn, apiUrl)`.

- [ ] **Step 1: Create the package**

Create `site/package.json` (versions are filled in by the install command in the next step):

```json
{
  "name": "mindwhisper-site",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.16.1",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "deploy": "pnpm build && pnpm dlx wrangler pages deploy dist --project-name mindwhisper"
  }
}
```

Create `site/tsconfig.json`:

```json
{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "lib": ["ES2022", "DOM"], "strict": true, "noUncheckedIndexedAccess": true, "skipLibCheck": true, "noEmit": true, "types": ["vite/client"] }, "include": ["src", "vite.config.ts"] }
```

Create `site/vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ build: { target: 'es2022' }, test: { environment: 'node' } });
```

Run: `cd site && pnpm add @fontsource-variable/inter && pnpm add -D vite typescript vitest && cp ../src-tauri/icons/icon.png public/icon.png` (create `site/public/` first with `mkdir -p public`).
Expected: `site/pnpm-lock.yaml` exists and `site/package.json` has the versions.

- [ ] **Step 2: Write the failing tests**

Create `site/src/download.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { detectOs, loadDownloads, pickDownloads, primaryFor, type ReleaseAsset } from './download';

const asset = (name: string): ReleaseAsset => ({ name, browser_download_url: `https://example.test/${name}` });
const release = [
  asset('Mindwhisper_0.1.0_aarch64.dmg'), asset('Mindwhisper_0.1.0_x64.dmg'),
  asset('Mindwhisper_0.1.0_x64-setup.exe'), asset('Mindwhisper_0.1.0_x64_en-US.msi'), asset('latest.json'),
];

describe('detectOs', () => {
  it('recognises the desktop systems we ship for', () => {
    expect(detectOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15')).toBe('mac');
    expect(detectOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36')).toBe('windows');
  });
  it('treats phones, Linux and unknown agents as other', () => {
    expect(detectOs('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15')).toBe('other');
    expect(detectOs('Mozilla/5.0 (X11; Linux x86_64) Firefox/130')).toBe('other');
    expect(detectOs('')).toBe('other');
  });
});

describe('pickDownloads', () => {
  it('maps release assets to the three downloads by name, whatever the version', () => {
    expect(pickDownloads(release).map((d) => [d.id, d.url.split('/').pop()])).toEqual([
      ['mac-arm', 'Mindwhisper_0.1.0_aarch64.dmg'], ['mac-intel', 'Mindwhisper_0.1.0_x64.dmg'], ['windows', 'Mindwhisper_0.1.0_x64-setup.exe'],
    ]);
    expect(pickDownloads([asset('Mindwhisper_12.4.1_aarch64.dmg')]).map((d) => d.id)).toEqual(['mac-arm']);
  });
  it('falls back to the MSI when there is no setup executable', () => {
    expect(pickDownloads([asset('Mindwhisper_0.1.0_x64_en-US.msi')]).map((d) => [d.id, d.url.split('/').pop()])).toEqual([['windows', 'Mindwhisper_0.1.0_x64_en-US.msi']]);
  });
  it('returns nothing for a release without installers', () => {
    expect(pickDownloads([asset('latest.json'), asset('source.zip')])).toEqual([]);
  });
});

describe('primaryFor', () => {
  const all = pickDownloads(release);
  it('picks Apple Silicon for Macs, the installer for Windows, nothing otherwise', () => {
    expect(primaryFor('mac', all)?.id).toBe('mac-arm');
    expect(primaryFor('windows', all)?.id).toBe('windows');
    expect(primaryFor('other', all)).toBeUndefined();
  });
  it('uses the Intel build on a Mac when it is the only one', () => {
    expect(primaryFor('mac', all.filter((d) => d.id === 'mac-intel'))?.id).toBe('mac-intel');
  });
});

describe('loadDownloads', () => {
  const json = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);
  it('reads the latest release from the API', async () => {
    expect((await loadDownloads(json({ assets: release }), 'https://api.test/latest')).length).toBe(3);
  });
  it('returns an empty list instead of throwing when the request fails, is refused or is malformed', async () => {
    expect(await loadDownloads(vi.fn(async () => { throw new Error('offline'); }), 'u')).toEqual([]);
    expect(await loadDownloads(json({}, false), 'u')).toEqual([]);
    expect(await loadDownloads(json({ nothing: true }), 'u')).toEqual([]);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd site && pnpm test`
Expected: FAIL, `./download` not found.

- [ ] **Step 4: Implement config and download logic**

Create `site/src/config.ts`:

```ts
/** The only place the repository is named. */
export const REPO = 'mmartinsoliv/mindwhisper';
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
export const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const ACCESS_REQUEST_URL =
  `https://github.com/${REPO}/issues/new?title=${encodeURIComponent('Access request')}` +
  `&body=${encodeURIComponent('Which system do you use (macOS or Windows), and where will you dictate? Do not paste any token or key here.')}`;
```

Create `site/src/download.ts`:

```ts
export type Os = 'mac' | 'windows' | 'other';
export type DownloadId = 'mac-arm' | 'mac-intel' | 'windows';
export interface ReleaseAsset { name: string; browser_download_url: string }
export interface Download { id: DownloadId; label: string; url: string }

export function detectOs(ua: string): Os {
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua)) return 'mac';
  return 'other';
}

// tauri-action names assets <ProductName>_<version>_<arch>.<ext>; match on the tail so a version bump needs no change here.
const RULES: { id: DownloadId; label: string; test: RegExp }[] = [
  { id: 'mac-arm', label: 'macOS, Apple Silicon', test: /_aarch64\.dmg$/i },
  { id: 'mac-intel', label: 'macOS, Intel', test: /_x64\.dmg$/i },
  { id: 'windows', label: 'Windows 10 and 11', test: /_x64-setup\.exe$/i },
];
const WINDOWS_MSI = /_x64_en-US\.msi$/i;

export function pickDownloads(assets: ReleaseAsset[]): Download[] {
  const out: Download[] = [];
  for (const r of RULES) {
    const a = assets.find((x) => r.test.test(x.name)) ?? (r.id === 'windows' ? assets.find((x) => WINDOWS_MSI.test(x.name)) : undefined);
    if (a) out.push({ id: r.id, label: r.label, url: a.browser_download_url });
  }
  return out;
}

export function primaryFor(os: Os, downloads: Download[]): Download | undefined {
  if (os === 'windows') return downloads.find((d) => d.id === 'windows');
  if (os === 'mac') return downloads.find((d) => d.id === 'mac-arm') ?? downloads.find((d) => d.id === 'mac-intel');
  return undefined;
}

/** Never throws: any failure means "no direct links", and the page keeps its link to the releases page. */
export async function loadDownloads(fetchFn: typeof fetch, apiUrl: string): Promise<Download[]> {
  try {
    const res = await fetchFn(apiUrl, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return [];
    const body = (await res.json()) as { assets?: ReleaseAsset[] };
    return Array.isArray(body.assets) ? pickDownloads(body.assets) : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd site && pnpm test && pnpm typecheck`
Expected: PASS, then the typecheck fails only because `src/main.ts` does not exist yet (that is fine; it is created next). If `tsc` complains about an empty include, continue to Step 6.

- [ ] **Step 6: Build the page**

This is the one part of the plan that is a design judgment, so the contract is the content, the behaviour and the constraints below, and the visual result is yours to get right. The references are https://session-deck.app/ and https://overdeck.app/ (a calm, dark, single-column product page with one clear action); fetch them to see the density and tone. Do not copy their text or assets.

Create `site/index.html`, `site/src/styles.css` and `site/src/main.ts` so that the page has these sections, in this order, with this copy (tighten wording if you must, but keep every claim; add none):

1. **Header:** the icon (`/icon.png`, 28 px) and the name "Mindwhisper"; right side links to `#how`, `#privacy`, `#install`, and a "Download" link to `#download`.
2. **Hero:** headline "Speak anywhere. It types for you." Subline: "Mindwhisper is a dictation app for macOS and Windows. Press a shortcut in any app, speak Portuguese (Brazil) or English, and tidy text lands in the field you were typing in." Primary button `id="download-primary"` (default text "Download", default `href` = `RELEASES_URL`) and a secondary link "Request access" (`data-access-link`). Under them one small line `id="download-note"`: "Access is by invitation while Mindwhisper is in early release."  Next to or under the text, a **CSS-only demo of the overlay**: a rounded pill with a pulsing red dot, the word "Listening" and five bars animating like a waveform. Animation only under `@media (prefers-reduced-motion: no-preference)`; static otherwise. Decorative, so `aria-hidden="true"`.
3. **How it works** (`id="how"`): three numbered steps. "Press the shortcut" (default Ctrl or Cmd + Shift + Space, in any app), "Speak" (a small overlay shows it is listening), "Press it again" (the text is cleaned up and pasted into the field you were in).
4. **Features**, a grid of six short cards: "Works in any app" (pastes into whatever field has focus); "Portuguese and English" (Português do Brasil, English, or automatic); "Optional AI cleanup" (fix punctuation, drop filler words, pick a style: minimal, professional, casual or concise; or keep your exact words); "Personal dictionary" (names and terms it should get right); "History you control" (kept on your computer only, with a retention period, and you can turn it off); "Stays out of the way" (lives in the tray; closing the window keeps dictation working).
5. **Privacy** (`id="privacy"`): four plain statements. While you dictate, audio is sent to the Mindwhisper server and on to a speech-to-text provider, and nothing is sent when you are not dictating. Audio is never written to disk. The recognized text goes to an AI provider for cleanup unless you turn cleanup off or choose to keep your words. History and your dictionary stay on your computer, and "Delete all my data" removes them. Provider keys live only on the server, never in the app.
6. **Download** (`id="download"`): a heading "Download Mindwhisper", the list `<ul id="download-list">` (empty until the script fills it; with `<noscript>` and a no-JS fallback link "All downloads on GitHub" to `RELEASES_URL`), and the sentence "Windows 10 and 11, and macOS 11 or newer. Linux is not supported yet." Then "Mindwhisper needs an access token for its server. Request one" with a `data-access-link` link.
7. **Install help** (`id="install"`), two columns. **macOS:** open the `.dmg` and drag Mindwhisper to Applications; the first time, right-click the app and choose Open, then Open again (or System Settings, Privacy & Security, Open Anyway); allow Microphone when asked and turn on Accessibility for Mindwhisper in System Settings, Privacy & Security, so it can paste; "macOS may ask for these permissions again after an update." **Windows:** run the installer; if "Windows protected your PC" appears, choose More info, then Run anyway; allow microphone access for desktop apps in Settings, Privacy, Microphone. One shared line: "These warnings appear because the early builds are not code-signed yet."
8. **FAQ**, four `<details>`: "Does it work offline?" (No: speech recognition runs on the server, so you need an internet connection.) "Which languages?" (Português do Brasil and English, with automatic detection.) "Is my history uploaded?" (No: it stays on your computer.) "Why does it need Accessibility on a Mac?" (To paste text into other apps; without it the text stays on the clipboard.)
9. **Footer:** "Mindwhisper" with the year (`id="year"`, filled by script) and a link "Releases" to `RELEASES_URL`.

Behaviour in `site/src/main.ts` (progressive enhancement; the page must be complete and linkable with scripts off):

```ts
import '@fontsource-variable/inter';
import './styles.css';
import { ACCESS_REQUEST_URL, LATEST_RELEASE_API, RELEASES_URL } from './config';
import { detectOs, loadDownloads, primaryFor, type Download } from './download';

document.querySelectorAll<HTMLAnchorElement>('[data-access-link]').forEach((a) => { a.href = ACCESS_REQUEST_URL; });
const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());

function render(downloads: Download[]) {
  const primary = document.getElementById('download-primary') as HTMLAnchorElement | null;
  const list = document.getElementById('download-list');
  if (!primary || !list) return;
  list.replaceChildren(...downloads.map((d) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = d.url; a.textContent = d.label; a.rel = 'noopener';
    li.append(a);
    return li;
  }));
  const os = detectOs(navigator.userAgent);
  const pick = primaryFor(os, downloads);
  if (pick) { primary.href = pick.url; primary.textContent = `Download for ${os === 'mac' ? 'macOS' : 'Windows'}`; }
  else { primary.href = '#download'; primary.textContent = 'See downloads'; }
}

void loadDownloads(fetch, LATEST_RELEASE_API).then((d) => {
  if (d.length === 0) {
    const list = document.getElementById('download-list');
    if (list) { const li = document.createElement('li'); const a = document.createElement('a'); a.href = RELEASES_URL; a.textContent = 'See the releases page'; li.append(a); list.replaceChildren(li); }
    return;
  }
  render(d);
});
```

Constraints for `index.html` and `styles.css`:
- `<title>Mindwhisper dictation</title>` exactly (a short name, not a sentence); `<meta name="description" content="Dictation for macOS and Windows. Press a shortcut in any app, speak Portuguese (Brazil) or English, and tidy text lands where you were typing.">`; `<link rel="icon" href="/icon.png">`; `<meta name="viewport" content="width=device-width, initial-scale=1">`; `lang="en"`.
- Colours as custom properties on `:root`, dark by default, with a light variant under `@media (prefers-color-scheme: light)`. Dark values to use: `--bg:#131211; --surface:#1b1a18; --surface-2:#242220; --border:#2f2c29; --text:#f2f0ec; --muted:#a29d94; --accent:#9b83ff; --accent-contrast:#14101f;` Light values: `--bg:#f7f6f3; --surface:#ffffff; --surface-2:#efede8; --border:#e3e0d9; --text:#1b1a17; --muted:#6b675f; --accent:#6f4ff5; --accent-contrast:#ffffff;`. The body gets an explicit `background: var(--bg)`.
- Font stack `'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif`.
- Works from 360 px wide with a 16 px side gutter and no horizontal scroll; content max width about 1040 px; headings use `clamp()`; the feature grid goes from one column to three.
- Real focus styles (`:focus-visible` outline in the accent), text contrast at least 4.5:1 against its background in both themes, links and buttons at least 44 px tall to tap, semantic landmarks (`header`, `main`, `section` with headings, `footer`), one `h1`.
- No third-party scripts, no analytics, no images except the icon, no external fonts (the Inter package is bundled).

- [ ] **Step 7: Check it builds and looks right**

Run: `cd site && pnpm test && pnpm typecheck && pnpm build`
Expected: PASS, and `site/dist/index.html` plus hashed assets exist.
Run `pnpm preview --port 4173` in the background, then take screenshots with the Chromium that the root package already has (run once if missing: `cd .. && pnpm exec playwright install chromium`):
`pnpm exec playwright screenshot --viewport-size=1280,900 --full-page http://localhost:4173 "$TMPDIR/site-desktop.png"` and the same with `--viewport-size=390,844` for `site-mobile.png`, run from the repository root. Read both images and fix anything broken: overflow at 390 px, low contrast, a section out of order, the overlay demo not visible. Also check with the network off (or by pointing `LATEST_RELEASE_API` at a dead URL temporarily and restoring it) that the page keeps its "See the releases page" link and nothing throws in the console. Stop the preview server when done.

- [ ] **Step 8: Commit**

```bash
git add site/package.json site/pnpm-lock.yaml site/tsconfig.json site/vite.config.ts site/index.html site/src site/public/icon.png
git commit -m "feat(site): landing page with OS-aware download links" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Documentation and the deploy runbook

**Files:**
- Modify: `README.md`
- Modify: `docs/PLATFORM-LIMITATIONS.md`
- Modify: `docs/MANUAL-TEST.md`
- Create: `docs/DEPLOY.md`

**Interfaces:**
- Consumes: the names fixed in Global Constraints and the behaviour of Tasks 1 to 6 (read their final code, not this plan).
- Produces: `docs/DEPLOY.md`, the owner's runbook.

- [ ] **Step 1: Read what the other tasks actually built**

Run: `git log --oneline` and read the final versions of `src-tauri/tauri.conf.json`, `server/wrangler.toml`, `server/package.json` (scripts), `.github/workflows/release.yml`, `site/src/config.ts`, `src/app/ShortcutBanner.tsx`, and the existing `README.md`, `docs/PLATFORM-LIMITATIONS.md`, `docs/MANUAL-TEST.md`. Where this plan and the code disagree, the code wins; write what the code does.

- [ ] **Step 2: Create `docs/DEPLOY.md`**

Write the owner's runbook. These steps need the owner's accounts, so they are written for a person, in order, each with the command and what to expect. Sections:

1. **What is hosted where** (three lines: Worker `mindwhisper-api`, Pages project `mindwhisper`, installers on GitHub Releases).
2. **One-time setup:** create the GitHub repository `mmartinsoliv/mindwhisper` and decide its visibility (the site's download links work for the public only if releases are public); `git remote add origin ...` and `git push -u origin main`; set the provider spend caps in the OpenAI, Anthropic or Gemini dashboards before issuing any token.
3. **Deploy the Worker:** `cd server`, `pnpm exec wrangler login`, then for each secret `pnpm exec wrangler secret put APP_TOKENS` (comma-separated tokens), `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (and `GEMINI_API_KEY` if used); edit `[vars]` in `server/wrangler.toml` if you choose other providers; `pnpm worker:deploy`; copy the printed `https://mindwhisper-api.<account>.workers.dev` URL; check `curl -s <url>/health` returns `{"ok":true}` and `curl -s -o /dev/null -w "%{http_code}" -X POST <url>/v1/cleanup` returns `401`.
4. **Issue and revoke tokens:** generate one per person with `openssl rand -hex 24`, add it to `APP_TOKENS` (the full comma-separated list is re-put each time), revoke by removing it; there is no per-user usage report, so the rate limit (30 requests per minute per token) and the provider spend caps are the cost controls.
5. **Point release builds at the Worker:** in the GitHub repository, Settings, Secrets and variables, Actions, Variables, add `DEFAULT_BACKEND_URL` with the Worker URL. Only builds made after this carry it.
6. **Cut a release:** bump `version` in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `package.json`; commit; `git tag v0.1.0 && git push origin v0.1.0`; wait for the `release` workflow; open the draft release on GitHub, check it has two `.dmg` files, one `-setup.exe` and one `.msi`; install each on a real machine and run the relevant rows of `docs/MANUAL-TEST.md`; then publish the draft.
7. **Deploy the site:** `cd site`, `pnpm install`, `pnpm deploy` (it builds and runs `wrangler pages deploy`; the first run asks to create the project `mindwhisper`); if you use another repository name or owner, change `REPO` in `site/src/config.ts` first. The page reads the latest published release, so it shows direct links only after step 6 is published.
8. **Not done by this project:** code signing and notarization, auto-update, a custom domain, Linux. Say what the user sees instead (the Gatekeeper and SmartScreen warnings the page explains).

- [ ] **Step 3: Update the existing docs**

In `README.md`: add a "Download and install" section near the top (what the page is, that access is by token, the two first-launch warnings in one sentence each, link to `docs/DEPLOY.md`); add "Releasing" pointing to `docs/DEPLOY.md`; in "Project structure" add `site/` (landing page), `.github/workflows/` (ci, release) and `server/src/worker.ts` (Cloudflare Worker entry); in "Run in development" note that `VITE_DEFAULT_BACKEND_URL` is optional and only baked into builds. Do not edit the "Verification status" table or its numbers: you did not rerun them. Add one line under it: "Release configuration, the Worker and the site were added on 2026-11-09 and have not been run on real machines; see docs/DEPLOY.md and docs/MANUAL-TEST.md."

In `docs/PLATFORM-LIMITATIONS.md`: remove or rewrite the limitation lines these tasks fixed (the backend URL and token saved on every keystroke; the startup shortcut conflict only logged; the disabled CSP) so they say what is true now, and add: "Releases are unsigned" with the exact user-visible behaviour on macOS (Gatekeeper, and permissions that may need granting again after an update because the build is only ad-hoc signed) and Windows (SmartScreen); "The hosted backend is invite-only: tokens are added by hand, there is no per-user usage reporting"; "The CSP has been set but not observed in a running webview" unless Task 1's `verified` says it was.

In `docs/MANUAL-TEST.md`: follow the existing table style and add rows for: installing the unsigned macOS `.dmg` and passing Gatekeeper; installing the Windows installer and passing SmartScreen; "the shortcut banner appears when the shortcut is taken at startup and disappears after choosing another one in Settings"; "no CSP errors in the webview console while using every page and a dictation"; "the download page buttons point at the published release assets". Leave every result column empty (nobody has run them).

- [ ] **Step 4: Check the docs**

Run: `grep -rn "TODO\|TBD\|<n>" README.md docs/DEPLOY.md docs/PLATFORM-LIMITATIONS.md docs/MANUAL-TEST.md` → no matches introduced by you.
Run: `grep -rnE "sk-[A-Za-z0-9]{10,}|AIza[0-9A-Za-z_-]{10,}|matheus\.martins" README.md docs site .github server/wrangler.toml server/.dev.vars.example` → no matches (no keys, no personal email).
Read `docs/DEPLOY.md` once as the owner would, with no other context, and confirm each command exists (`pnpm worker:deploy`, `pnpm deploy` in `site/`, the workflow name `release`).

- [ ] **Step 5: Commit**

```bash
git add README.md docs/PLATFORM-LIMITATIONS.md docs/MANUAL-TEST.md docs/DEPLOY.md
git commit -m "docs: download, release and deploy runbook, and updated limitations" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
