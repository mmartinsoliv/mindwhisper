use super::{ClipboardBackend, KeySimulator};
use crate::error::AppError;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};

pub struct SystemClipboard(arboard::Clipboard);
impl SystemClipboard {
    pub fn new() -> Result<Self, AppError> {
        arboard::Clipboard::new().map(Self).map_err(|e| AppError::new("insert_failed", format!("Cannot access the clipboard: {e}")))
    }
}
impl ClipboardBackend for SystemClipboard {
    fn get_text(&mut self) -> Result<Option<String>, AppError> {
        match self.0.get_text() {
            Ok(t) => Ok(Some(t)),
            Err(arboard::Error::ContentNotAvailable) => Ok(None),
            Err(e) => Err(AppError::new("insert_failed", format!("Cannot read the clipboard: {e}"))),
        }
    }
    fn set_text(&mut self, text: &str) -> Result<(), AppError> {
        self.0.set_text(text.to_string()).map_err(|e| AppError::new("insert_failed", format!("Cannot write the clipboard: {e}")))
    }
}

pub struct SystemKeys(Enigo);
impl SystemKeys {
    pub fn new() -> Result<Self, AppError> {
        Enigo::new(&Settings::default()).map(Self).map_err(|e| AppError::new("permission_denied", format!("Cannot simulate keyboard input: {e}")))
    }
}
impl KeySimulator for SystemKeys {
    fn paste(&mut self) -> Result<(), AppError> {
        #[cfg(target_os = "macos")] let modifier = Key::Meta;
        #[cfg(not(target_os = "macos"))] let modifier = Key::Control;
        let err = |e: enigo::InputError| AppError::new("insert_failed", format!("Paste shortcut failed: {e}"));
        self.0.key(modifier, Direction::Press).map_err(err)?;
        let r = self.0.key(Key::Unicode('v'), Direction::Click);
        let _ = self.0.key(modifier, Direction::Release); // always release the modifier
        r.map_err(err)
    }
}
