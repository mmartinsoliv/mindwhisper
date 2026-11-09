use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{App, Manager};

pub fn build(app: &App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Mindwhisper", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut b = TrayIconBuilder::new().menu(&menu).tooltip("Mindwhisper");
    if let Some(icon) = app.default_window_icon() { b = b.icon(icon.clone()); }
    b.on_menu_event(|app, event| match event.id().as_ref() {
        "open" => { if let Some(w) = app.get_webview_window("main") { let _ = w.unminimize(); let _ = w.show(); let _ = w.set_focus(); } }
        "quit" => app.exit(0),
        _ => {}
    }).build(app)?;
    Ok(())
}
