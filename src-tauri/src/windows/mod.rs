use crate::error::{AppError, CmdResult};
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, WebviewWindow};

const OVERLAY: &str = "overlay";
const MARGIN: f64 = 48.0;

pub fn bottom_center(mon_pos: (i32, i32), mon_size: (u32, u32), win_logical: (f64, f64), scale: f64, margin_logical: f64) -> (i32, i32) {
    let w = (win_logical.0 * scale).round() as i32;
    let h = (win_logical.1 * scale).round() as i32;
    let m = (margin_logical * scale).round() as i32;
    (mon_pos.0 + (mon_size.0 as i32 - w) / 2, mon_pos.1 + mon_size.1 as i32 - h - m)
}

pub fn monitor_index_for(monitors: &[((i32, i32), (u32, u32))], cursor: (f64, f64)) -> usize {
    monitors.iter().position(|((x, y), (w, h))| {
        cursor.0 >= *x as f64 && cursor.0 < (*x + *w as i32) as f64 && cursor.1 >= *y as f64 && cursor.1 < (*y + *h as i32) as f64
    }).unwrap_or(0)
}

fn overlay(app: &AppHandle) -> CmdResult<WebviewWindow> {
    app.get_webview_window(OVERLAY).ok_or_else(|| AppError::new("internal", "Overlay window is missing."))
}
fn err<E: std::fmt::Display>(e: E) -> AppError { AppError::new("internal", e.to_string()) }

fn place(app: &AppHandle, win: &WebviewWindow) -> CmdResult<()> {
    let monitors = app.available_monitors().map_err(err)?;
    if monitors.is_empty() { return Ok(()); }
    let cursor = app.cursor_position().map(|p| (p.x, p.y)).unwrap_or((0.0, 0.0));
    let list: Vec<_> = monitors.iter().map(|m| ((m.position().x, m.position().y), (m.size().width, m.size().height))).collect();
    let m = &monitors[monitor_index_for(&list, cursor)];
    let size = win.outer_size().map_err(err)?;
    let scale = m.scale_factor();
    let logical = (size.width as f64 / scale, size.height as f64 / scale);
    let (x, y) = bottom_center((m.position().x, m.position().y), (m.size().width, m.size().height), logical, scale, MARGIN);
    win.set_position(PhysicalPosition::new(x, y)).map_err(err)
}

#[tauri::command]
pub fn overlay_show(app: AppHandle) -> CmdResult<()> {
    let win = overlay(&app)?;
    place(&app, &win)?;
    win.set_always_on_top(true).map_err(err)?;
    #[cfg(target_os = "macos")] { let _ = win.set_visible_on_all_workspaces(true); }
    win.show().map_err(err)?; // never call set_focus: the overlay must not take keyboard focus from the target app
    Ok(())
}

#[tauri::command]
pub fn overlay_hide(app: AppHandle) -> CmdResult<()> { overlay(&app)?.hide().map_err(err) }

#[tauri::command]
pub fn overlay_resize(app: AppHandle, width: f64, height: f64) -> CmdResult<()> {
    let win = overlay(&app)?;
    win.set_size(LogicalSize::new(width, height)).map_err(err)?;
    if win.is_visible().unwrap_or(false) { place(&app, &win)?; }
    Ok(())
}

#[tauri::command]
pub fn main_show(app: AppHandle) -> CmdResult<()> {
    let win = app.get_webview_window("main").ok_or_else(|| AppError::new("internal", "Main window is missing."))?;
    let _ = win.unminimize();
    win.show().map_err(err)?;
    win.set_focus().map_err(err)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn centers_horizontally_and_sits_above_the_bottom_edge() {
        // 2560x1440 monitor at origin, scale 2.0, overlay 320x64 logical, 48 logical px margin
        let (x, y) = bottom_center((0, 0), (2560, 1440), (320.0, 64.0), 2.0, 48.0);
        assert_eq!(x, (2560 - 640) / 2);
        assert_eq!(y, 1440 - 128 - 96);
    }

    #[test]
    fn respects_monitor_offset_for_secondary_displays() {
        let (x, y) = bottom_center((-1920, 0), (1920, 1080), (320.0, 64.0), 1.0, 40.0);
        assert_eq!(x, -1920 + (1920 - 320) / 2);
        assert_eq!(y, 1080 - 64 - 40);
    }

    #[test]
    fn picks_the_monitor_containing_the_cursor_else_the_first() {
        let m = [((0, 0), (1920u32, 1080u32)), ((1920, 0), (1920, 1080))];
        assert_eq!(monitor_index_for(&m, (2500.0, 200.0)), 1);
        assert_eq!(monitor_index_for(&m, (100.0, 100.0)), 0);
        assert_eq!(monitor_index_for(&m, (-5000.0, 0.0)), 0);
    }
}
