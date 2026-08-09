//! 红绿灯挂件（Signal Dock）— 独立 app 入口
//!
//! A lightweight always-on-top desktop widget showing every pi session's
//! traffic light + a todo list. Two processes-worth of concerns ONLY:
//!   - the signal HTTP endpoint (127.0.0.1:9087) that any agent can POST to
//!   - the always-on-top dock window (expand/collapse, snap, drag, resize)
//!
//! This crate is deliberately minimal: no terminal/pty/ssh/project code.

mod signal;

use signal::{SignalStore, SIGNAL_PORT};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;

/// Product data directory (APPDATA on Windows) where todos.json lives.
fn data_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."))
}

/// Tauri command: load persisted todos (JSON file in the app data dir).
/// Returns [] on any failure (degrade, don't crash).
#[tauri::command]
fn load_todos(app: tauri::AppHandle) -> Vec<serde_json::Value> {
    let path = data_dir(&app).join("todos.json");
    match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

/// Tauri command: persist todos to the JSON file (atomic-ish write).
#[tauri::command]
fn save_todos(app: tauri::AppHandle, todos: Vec<serde_json::Value>) -> Result<(), String> {
    let dir = data_dir(&app);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("todos.json");
    let json = serde_json::to_string_pretty(&todos).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {
            // Second instance: focus the existing dock window.
            if let Some(win) = _app.get_webview_window("signal-dock") {
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();

            // Signal store + always-on HTTP endpoint (127.0.0.1:9087). Any pi
            // hook / script POSTs status here; every mutation pushes a
            // `signal-updated` event to the renderer (no polling).
            let signal_store = Arc::new(SignalStore::new());
            app.manage(signal_store.clone());
            signal::spawn_signal_server(signal_store.clone(), handle.clone());

            // Dock window: position it (right edge, remembered Y or vertically
            // centered) then show — never flash at a wrong spot.
            if let Some(dock) = app.get_webview_window("signal-dock") {
                if let Some(monitor) = app.primary_monitor().ok().flatten() {
                    let m = monitor.size();
                    let d = monitor.scale_factor();
                    let dw = (280.0 * d) as i32;
                    let dh = (400.0 * d) as i32;
                    let x = m.width as i32 - dw - (12.0 * d) as i32;
                    let y = ((m.height as i32 - dh) / 2).max(0);
                    if let Err(e) = dock.set_position(tauri::PhysicalPosition::new(x, y)) {
                        log::warn!("[signal-dock] failed to set position: {}", e);
                    }
                }
                if let Err(e) = dock.show() {
                    log::warn!("[signal-dock] failed to show: {}", e);
                }
            }

            log::info!("[workboard-dock] signal endpoint on 127.0.0.1:{SIGNAL_PORT}");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            signal::get_signal_summary,
            signal::clear_signal,
            load_todos,
            save_todos,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
            // no-op event loop
        });
}
