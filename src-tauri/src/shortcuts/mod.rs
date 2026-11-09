use crate::error::{AppError, CmdResult};
use serde_json::json;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ShortcutMode { Toggle, Hold }

impl ShortcutMode {
    pub fn parse(s: &str) -> Result<Self, AppError> {
        match s { "toggle" => Ok(Self::Toggle), "hold" => Ok(Self::Hold), _ => Err(AppError::new("shortcut_invalid", "Shortcut mode must be toggle or hold.")) }
    }
}

pub fn action_for(mode: ShortcutMode, state: ShortcutState) -> Option<&'static str> {
    match (mode, state) {
        (ShortcutMode::Toggle, ShortcutState::Pressed) => Some("toggle"),
        (ShortcutMode::Toggle, ShortcutState::Released) => None,
        (ShortcutMode::Hold, ShortcutState::Pressed) => Some("start"),
        (ShortcutMode::Hold, ShortcutState::Released) => Some("stop"),
    }
}

/// Filters OS key auto-repeat (hold) and rapid double presses (toggle).
pub struct ShortcutGate { mode: ShortcutMode, held: bool, last_toggle: Option<Instant> }
impl ShortcutGate {
    pub fn new(mode: ShortcutMode) -> Self { Self { mode, held: false, last_toggle: None } }
    pub fn handle(&mut self, state: ShortcutState, now: Instant) -> Option<&'static str> {
        match (self.mode, state) {
            (ShortcutMode::Hold, ShortcutState::Pressed) => { if self.held { return None; } self.held = true; }
            (ShortcutMode::Hold, ShortcutState::Released) => { if !self.held { return None; } self.held = false; }
            (ShortcutMode::Toggle, ShortcutState::Pressed) => {
                if self.last_toggle.map_or(false, |t| now.duration_since(t) < Duration::from_millis(250)) { return None; }
                self.last_toggle = Some(now);
            }
            (ShortcutMode::Toggle, ShortcutState::Released) => {}
        }
        action_for(self.mode, state)
    }
}

pub fn parse_accelerator(s: &str) -> Result<Shortcut, AppError> {
    s.trim().parse::<Shortcut>().map_err(|_| AppError::new("shortcut_invalid", format!("\"{s}\" is not a valid shortcut.")))
}

/// What `shortcut_register` must do given the current registration.
#[derive(Debug, PartialEq, Eq)]
pub enum RegisterPlan {
    /// Same accelerator: keep the OS registration and only swap the mode.
    UpdateModeOnly,
    /// Register the new shortcut first; only once that succeeds unregister `replace`.
    RegisterNew { replace: Option<Shortcut> },
}

pub fn plan_register(current: Option<Shortcut>, requested: Shortcut) -> RegisterPlan {
    match current {
        Some(c) if c == requested => RegisterPlan::UpdateModeOnly,
        other => RegisterPlan::RegisterNew { replace: other },
    }
}

struct ActiveShortcut { shortcut: Shortcut, gate: Arc<Mutex<ShortcutGate>> }

#[derive(Default)]
pub struct ShortcutRegistry { current: Mutex<Option<ActiveShortcut>>, cancel: Mutex<Option<Shortcut>> }

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> { m.lock().unwrap_or_else(|e| e.into_inner()) }

fn emit_action(app: &AppHandle, action: &str) { let _ = app.emit("dictation://hotkey", json!({ "action": action })); }

/// The plugin flattens every `global_hotkey` error into `Error::GlobalHotkey(String)`, so there is no
/// variant to match on; the messages below come from global-hotkey 0.8.0 (`error.rs`, macOS backend):
/// - "HotKey already registered: ..." (`AlreadyRegistered`)          -> shortcut_taken
/// - "Unable to register hotkey: RegisterEventHotKey failed for ..." -> shortcut_taken (the OS refused: held by another app)
/// - "Unable to register hotkey: Unknown scancode for ..."           -> shortcut_invalid (key has no scancode)
/// - parse errors (unrecognized code, empty token, bad format)       -> shortcut_invalid
pub fn classify_register_error(message: &str) -> AppError {
    let m = message.to_lowercase();
    let taken = m.contains("already registered") || (m.contains("unable to register hotkey") && !m.contains("unknown scancode"));
    if taken { AppError::new("shortcut_taken", "Another app is already using this shortcut. Pick a different one.") }
    else { AppError::new("shortcut_invalid", message) }
}

fn map_register_err(e: tauri_plugin_global_shortcut::Error) -> AppError {
    use tauri_plugin_global_shortcut::Error;
    match e {
        Error::GlobalHotkey(msg) => classify_register_error(&msg),
        other => AppError::new("internal", other.to_string()), // main-thread dispatch / runtime failures
    }
}

#[tauri::command]
pub fn shortcut_register(app: AppHandle, reg: State<ShortcutRegistry>, accelerator: String, mode: String) -> CmdResult<()> {
    let mode = ShortcutMode::parse(&mode)?;
    let shortcut = parse_accelerator(&accelerator)?;
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
pub fn shortcut_unregister(app: AppHandle, reg: State<ShortcutRegistry>) -> CmdResult<()> {
    if let Some(old) = lock(&reg.current).take() { let _ = app.global_shortcut().unregister(old.shortcut); }
    Ok(())
}

#[tauri::command]
pub fn shortcut_set_cancel_enabled(app: AppHandle, reg: State<ShortcutRegistry>, enabled: bool) -> CmdResult<()> {
    if enabled {
        let mut cancel = lock(&reg.cancel);
        if cancel.is_none() {
            let esc = parse_accelerator("Escape")?;
            app.global_shortcut()
                .on_shortcut(esc, |app, _sc, event| { if event.state() == ShortcutState::Pressed { emit_action(app, "cancel"); } })
                .map_err(map_register_err)?;
            *cancel = Some(esc);
        }
        Ok(())
    } else {
        release_cancel(&app);
        Ok(())
    }
}

/// Releases the global Escape registration if held. Called when the frontend disables it and as a
/// backstop on `audio_cancel` (not on `audio_stop`: Escape must keep working while transcribing) and on exit.
pub fn release_cancel(app: &AppHandle) {
    if let Some(reg) = app.try_state::<ShortcutRegistry>() {
        if let Some(esc) = lock(&reg.cancel).take() { let _ = app.global_shortcut().unregister(esc); }
    }
}

/// Drops every global registration (app exit).
pub fn unregister_all(app: &AppHandle) {
    if let Some(reg) = app.try_state::<ShortcutRegistry>() {
        lock(&reg.current).take();
        lock(&reg.cancel).take();
    }
    let _ = app.global_shortcut().unregister_all();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};
    use tauri_plugin_global_shortcut::ShortcutState::{Pressed, Released};

    #[test]
    fn action_mapping() {
        assert_eq!(action_for(ShortcutMode::Toggle, Pressed), Some("toggle"));
        assert_eq!(action_for(ShortcutMode::Toggle, Released), None);
        assert_eq!(action_for(ShortcutMode::Hold, Pressed), Some("start"));
        assert_eq!(action_for(ShortcutMode::Hold, Released), Some("stop"));
    }

    #[test]
    fn hold_mode_ignores_key_repeat() {
        let mut g = ShortcutGate::new(ShortcutMode::Hold);
        let t = Instant::now();
        assert_eq!(g.handle(Pressed, t), Some("start"));
        assert_eq!(g.handle(Pressed, t + Duration::from_millis(30)), None); // OS auto-repeat
        assert_eq!(g.handle(Pressed, t + Duration::from_millis(60)), None);
        assert_eq!(g.handle(Released, t + Duration::from_millis(900)), Some("stop"));
        assert_eq!(g.handle(Released, t + Duration::from_millis(910)), None); // stray release
        assert_eq!(g.handle(Pressed, t + Duration::from_secs(2)), Some("start"));
    }

    #[test]
    fn toggle_mode_debounces_rapid_presses() {
        let mut g = ShortcutGate::new(ShortcutMode::Toggle);
        let t = Instant::now();
        assert_eq!(g.handle(Pressed, t), Some("toggle"));
        assert_eq!(g.handle(Pressed, t + Duration::from_millis(100)), None);
        assert_eq!(g.handle(Pressed, t + Duration::from_millis(400)), Some("toggle"));
    }

    #[test]
    fn parses_accelerators_and_rejects_garbage() {
        assert!(parse_accelerator("CommandOrControl+Shift+Space").is_ok());
        assert!(parse_accelerator("Alt+F9").is_ok());
        assert_eq!(parse_accelerator("Banana+++").unwrap_err().code, "shortcut_invalid");
        assert_eq!(parse_accelerator("").unwrap_err().code, "shortcut_invalid");
    }

    #[test]
    fn parses_mode() {
        assert_eq!(ShortcutMode::parse("toggle").unwrap(), ShortcutMode::Toggle);
        assert_eq!(ShortcutMode::parse("hold").unwrap(), ShortcutMode::Hold);
        assert_eq!(ShortcutMode::parse("x").unwrap_err().code, "shortcut_invalid");
    }

    #[test]
    fn register_plan_keeps_old_until_new_succeeds() {
        let a = parse_accelerator("Alt+F9").unwrap();
        let b = parse_accelerator("Alt+F10").unwrap();
        assert_eq!(plan_register(None, a), RegisterPlan::RegisterNew { replace: None });
        assert_eq!(plan_register(Some(a), b), RegisterPlan::RegisterNew { replace: Some(a) });
        assert_eq!(plan_register(Some(a), a), RegisterPlan::UpdateModeOnly);
    }

    #[test]
    fn classifies_register_errors_from_global_hotkey_messages() {
        let taken = |m: &str| classify_register_error(m).code == "shortcut_taken";
        assert!(taken("HotKey already registered: HotKey { mods: Modifiers(ALT), key: F9, id: 1 }"));
        assert!(taken("Unable to register hotkey: RegisterEventHotKey failed for KeyF"));
        assert_eq!(classify_register_error("Unable to register hotkey: Unknown scancode for Foo").code, "shortcut_invalid");
        assert_eq!(classify_register_error("Couldn't recognize \"Banana\" as a valid HotKey Code").code, "shortcut_invalid");
        assert_eq!(classify_register_error("Unexpected empty token while parsing hotkey: \"+\"").code, "shortcut_invalid");
    }
}
