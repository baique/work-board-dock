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

/// Tauri command: dock the window to the desktop (置底模式).
/// `enabled: true` sinks the window under the desktop shell (Progman/
/// WorkerW) so it behaves like a desktop widget — always visible, never
/// stealing focus, never on top of other windows. `false` restores the
/// normal always-on-top behavior. No-op outside Windows.
#[tauri::command]
fn set_desktop_dock(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Foundation::HWND;
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            EnumWindows, FindWindowW, GetWindowLongPtrW, SendMessageW, SetParent, SetWindowPos,
            HWND_BOTTOM, SWP_NOSIZE, SWP_NOMOVE, SWP_NOACTIVATE,
        };

        const GWLP_HWND_PARENT: i32 = -8;
        const WM_SPAWN_WORKERW: u32 = 0x052C;

        fn find_desktop_workerw() -> HWND {
            unsafe {
                // Progman hosts the desktop icon layer; sending WM_SPAWN_WORKERW
                // forces it to create the WorkerW that covers the wallpaper.
                let progman_class: Vec<u16> =
                    "Progman".encode_utf16().chain(std::iter::once(0)).collect();
                let progman = FindWindowW(progman_class.as_ptr(), std::ptr::null());
                if progman.is_null() {
                    return std::ptr::null_mut();
                }
                SendMessageW(progman, WM_SPAWN_WORKERW, 0, 0);
                let mut workerw: HWND = std::ptr::null_mut();
                unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: isize) -> i32 {
                    // The WorkerW whose child is SHELLDLL_DefView is the one
                    // above the wallpaper, below all apps. The class name is
                    // built here (fixed string, fine to rebuild per window).
                    let def_view_class: Vec<u16> = "SHELLDLL_DefView"
                        .encode_utf16()
                        .chain(std::iter::once(0))
                        .collect();
                    let shell_view = FindWindowW(def_view_class.as_ptr(), std::ptr::null());
                    if shell_view.is_null() {
                        return 1;
                    }
                    if GetWindowLongPtrW(hwnd, GWLP_HWND_PARENT) == shell_view as isize {
                        *(lparam as *mut HWND) = hwnd;
                        return 0;
                    }
                    1
                }
                EnumWindows(Some(enum_proc), &mut workerw as *mut HWND as isize);
                workerw
            }
        }

        let Some(win) = app.get_webview_window("signal-dock") else {
            return Err("signal-dock window not found".into());
        };
        unsafe {
            let hwnd = win.hwnd().ok_or("no hwnd")? as HWND;
            if enabled {
                let workerw = find_desktop_workerw();
                if workerw.is_null() {
                    return Err("desktop worker not found".into());
                }
                // Sink under the desktop shell; no-activate so it never steals focus.
                SetParent(hwnd, workerw);
                SetWindowPos(
                    hwnd,
                    HWND_BOTTOM,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE,
                );
            } else {
                // Detach from desktop; parent back to the normal owner so the
                // window floats again (always-on-top re-enabled by frontend).
                SetParent(hwnd, std::ptr::null_mut());
                SetWindowPos(
                    hwnd,
                    HWND_BOTTOM,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE,
                );
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, enabled);
    }
    Ok(())
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
            set_desktop_dock,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
            // no-op event loop
        });
}
