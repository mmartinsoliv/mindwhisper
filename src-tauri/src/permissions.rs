use crate::error::{AppError, CmdResult};
use serde::Serialize;

#[derive(Serialize)]
pub struct PermissionStatus { pub platform: String, pub accessibility: String }

pub fn accessibility_label(trusted: Option<bool>) -> &'static str {
    match trusted { Some(true) => "granted", Some(false) => "denied", None => "unsupported" }
}

pub fn settings_url(pane: &str) -> Result<&'static str, AppError> {
    match pane {
        "accessibility" => Ok("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"),
        "microphone" => Ok("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"),
        _ => Err(AppError::new("internal", "Unknown settings pane.")),
    }
}

#[cfg(target_os = "macos")]
fn accessibility_trusted() -> Option<bool> {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" { fn AXIsProcessTrusted() -> bool; }
    Some(unsafe { AXIsProcessTrusted() })
}
#[cfg(not(target_os = "macos"))]
fn accessibility_trusted() -> Option<bool> { None }

fn platform() -> &'static str {
    if cfg!(target_os = "macos") { "macos" } else if cfg!(target_os = "windows") { "windows" } else { "linux" }
}

#[tauri::command]
pub fn check_permissions() -> CmdResult<PermissionStatus> {
    Ok(PermissionStatus { platform: platform().into(), accessibility: accessibility_label(accessibility_trusted()).into() })
}

#[tauri::command]
pub fn open_system_settings(pane: String) -> CmdResult<()> {
    let url = settings_url(&pane)?;
    #[cfg(target_os = "macos")]
    { std::process::Command::new("open").arg(url).spawn().map_err(|e| AppError::new("internal", e.to_string()))?; }
    #[cfg(target_os = "windows")]
    {
        let uri = if pane == "microphone" { "ms-settings:privacy-microphone" } else { "ms-settings:easeofaccess" };
        std::process::Command::new("cmd").args(["/C", "start", "", uri]).spawn().map_err(|e| AppError::new("internal", e.to_string()))?;
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    { let _ = url; }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn status_labels() {
        assert_eq!(accessibility_label(Some(true)), "granted");
        assert_eq!(accessibility_label(Some(false)), "denied");
        assert_eq!(accessibility_label(None), "unsupported");
    }
    #[test]
    fn pane_urls_and_unknown_panes() {
        assert!(settings_url("accessibility").unwrap().contains("Privacy_Accessibility"));
        assert!(settings_url("microphone").unwrap().contains("Privacy_Microphone"));
        assert_eq!(settings_url("bogus").unwrap_err().code, "internal");
    }
}
