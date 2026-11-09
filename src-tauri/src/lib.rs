use tauri::Manager;

mod audio;
mod error;
mod insertion;
mod permissions;
mod shortcuts;
mod tray;
mod windows;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .manage(audio::AudioState::<audio::capture::Recorder>::default())
        .manage(shortcuts::ShortcutRegistry::default())
        .setup(|app| {
            tray::build(app)?;
            let minimized = std::env::args().any(|a| a == "--minimized");
            if !minimized {
                if let Some(w) = app.get_webview_window("main") { let _ = w.show(); }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide(); // keep the app (and the overlay's dictation controller) alive in the tray
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            audio::audio_list_devices, audio::audio_probe, audio::audio_start, audio::audio_stop, audio::audio_cancel,
            insertion::insert_text,
            permissions::check_permissions, permissions::open_system_settings,
            shortcuts::shortcut_register, shortcuts::shortcut_unregister, shortcuts::shortcut_set_cancel_enabled,
            windows::overlay_show, windows::overlay_hide, windows::overlay_resize, windows::main_show,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Mindwhisper")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // Never leave the microphone open or a global shortcut (Escape!) swallowed after we quit.
                audio::cancel_active(app);
                shortcuts::unregister_all(app);
            }
        });
}
