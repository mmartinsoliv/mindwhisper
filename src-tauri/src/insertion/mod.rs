pub mod platform;

use crate::error::{AppError, CmdResult};
use serde::Serialize;
use std::time::Duration;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InsertResult { pub clipboard_restored: bool }

pub trait ClipboardBackend {
    /// `Ok(None)` when the clipboard holds no plain text (image, files, empty).
    fn get_text(&mut self) -> Result<Option<String>, AppError>;
    fn set_text(&mut self, text: &str) -> Result<(), AppError>;
}
pub trait KeySimulator { fn paste(&mut self) -> Result<(), AppError>; }

pub fn insert_with(clip: &mut dyn ClipboardBackend, keys: &mut dyn KeySimulator, text: &str, restore: bool, settle: Duration) -> CmdResult<InsertResult> {
    if text.is_empty() { return Err(AppError::new("insert_failed", "There is no text to insert.")); }
    let previous = if restore { clip.get_text().unwrap_or(None) } else { None };
    clip.set_text(text)?;
    keys.paste()?; // on failure the text stays on the clipboard so the user can paste manually
    std::thread::sleep(settle); // let the target app read the clipboard before we overwrite it
    let mut restored = false;
    if restore {
        if let Some(prev) = previous { restored = clip.set_text(&prev).is_ok(); }
    }
    Ok(InsertResult { clipboard_restored: restored })
}

/// Async + `spawn_blocking`: the 200 ms settle sleep and the key simulation must not freeze the UI thread.
#[tauri::command]
pub async fn insert_text(text: String, restore_clipboard: bool) -> CmdResult<InsertResult> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut clip = platform::SystemClipboard::new()?;
        let mut keys = platform::SystemKeys::new()?;
        insert_with(&mut clip, &mut keys, &text, restore_clipboard, Duration::from_millis(200))
    })
    .await
    .map_err(|e| AppError::new("internal", e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[derive(Default)]
    struct FakeClip { text: Option<String>, sets: Vec<String>, fail_get: bool, fail_set_after: Option<usize> }
    impl ClipboardBackend for FakeClip {
        fn get_text(&mut self) -> Result<Option<String>, AppError> {
            if self.fail_get { return Err(AppError::new("insert_failed", "clipboard busy")); }
            Ok(self.text.clone())
        }
        fn set_text(&mut self, t: &str) -> Result<(), AppError> {
            if self.fail_set_after.map_or(false, |n| self.sets.len() >= n) { return Err(AppError::new("insert_failed", "clipboard busy")); }
            self.sets.push(t.to_string());
            self.text = Some(t.to_string());
            Ok(())
        }
    }
    #[derive(Default)]
    struct FakeKeys { pastes: usize, fail: bool }
    impl KeySimulator for FakeKeys {
        fn paste(&mut self) -> Result<(), AppError> {
            if self.fail { return Err(AppError::new("permission_denied", "no accessibility")); }
            self.pastes += 1;
            Ok(())
        }
    }
    const T: Duration = Duration::from_millis(0);

    #[test]
    fn pastes_then_restores_previous_clipboard_text() {
        let mut c = FakeClip { text: Some("old".into()), ..Default::default() };
        let mut k = FakeKeys::default();
        let r = insert_with(&mut c, &mut k, "hello", true, T).unwrap();
        assert_eq!(k.pastes, 1);
        assert_eq!(c.sets, vec!["hello".to_string(), "old".to_string()]);
        assert_eq!(c.text.as_deref(), Some("old"));
        assert!(r.clipboard_restored);
    }

    #[test]
    fn leaves_inserted_text_on_clipboard_when_restore_disabled() {
        let mut c = FakeClip { text: Some("old".into()), ..Default::default() };
        let mut k = FakeKeys::default();
        let r = insert_with(&mut c, &mut k, "hello", false, T).unwrap();
        assert_eq!(c.text.as_deref(), Some("hello"));
        assert!(!r.clipboard_restored);
    }

    #[test]
    fn reports_not_restored_when_previous_clipboard_was_not_text() {
        let mut c = FakeClip { text: None, ..Default::default() };
        let mut k = FakeKeys::default();
        let r = insert_with(&mut c, &mut k, "hello", true, T).unwrap();
        assert!(!r.clipboard_restored);
        assert_eq!(k.pastes, 1);
    }

    #[test]
    fn paste_failure_keeps_text_on_clipboard_and_returns_the_error() {
        let mut c = FakeClip { text: Some("old".into()), ..Default::default() };
        let mut k = FakeKeys { fail: true, ..Default::default() };
        let e = insert_with(&mut c, &mut k, "hello", true, T).unwrap_err();
        assert_eq!(e.code, "permission_denied");
        assert_eq!(c.text.as_deref(), Some("hello")); // user can paste manually; old clipboard is not restored on failure
    }

    #[test]
    fn empty_text_is_rejected_without_touching_the_clipboard() {
        let mut c = FakeClip { text: Some("old".into()), ..Default::default() };
        let mut k = FakeKeys::default();
        assert_eq!(insert_with(&mut c, &mut k, "", true, T).unwrap_err().code, "insert_failed");
        assert!(c.sets.is_empty() && k.pastes == 0);
    }
}
