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

/// Tauri command: toggle 置底模式 (desktop-widget behavior).
///
/// `enabled: true` removes always-on-top so normal windows can cover the
/// dock (widget behaves like a normal window parked on the desktop);
/// `false` restores always-on-top. No-op outside Windows.
///
/// NOTE: an earlier version really embedded the window under the desktop
/// shell via SetParent -> WorkerW. That froze the window: WebView2 input
/// depends on the window being top-level (parent forwards clicks), and a
/// WorkerW child gets no mouse/keyboard events at all. Dropped in favor of
/// a plain z-order toggle — same visible behavior (covered by windows,
/// still visible when everything is minimized), no freeze.
#[tauri::command]
fn set_desktop_dock(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Foundation::HWND;
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOSIZE, SWP_NOMOVE, SWP_NOACTIVATE,
        };

        let Some(win) = app.get_webview_window("signal-dock") else {
            return Err("signal-dock window not found".into());
        };
        if enabled {
            // 去置顶：普通窗口可覆盖挂件（置底 = 非置顶的常驻窗口）。
            // 不碰 SetParent（WebView2 子窗口无输入 → 假死）。
            let _ = win.set_always_on_top(false);
            unsafe {
                let hwnd = win.hwnd().map_err(|_| "no hwnd".to_string())?.0 as HWND;
                SetWindowPos(
                    hwnd,
                    HWND_NOTOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE,
                );
            }
        } else {
            unsafe {
                let hwnd = win.hwnd().map_err(|_| "no hwnd".to_string())?.0 as HWND;
                // 显式置顶（HWND_TOPMOST）——不依赖 Tauri 的 set_always_on_top：
                // 其内部缓存可能与真实窗口不同步，可能短路不生效。
                SetWindowPos(
                    hwnd,
                    HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE,
                );
            }
            // 同步 Tauri 内部状态（若内部已缓存 false，这里纠正为 true）。
            let _ = win.set_always_on_top(true);
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

            // Tray icon: left-click shows the dock; menu offers show/quit.
            // Simple white "T" glyph on transparent bg, embedded at compile
            // time (include_bytes!) — no runtime file dependency.
            let tray_icon = tauri::image::Image::from_bytes(
                include_bytes!("../icons/tray-t.png"),
            )
            .map_err(|e| e.to_string())?;
            let show_menu = tauri::menu::MenuBuilder::new(app)
                .item(&tauri::menu::MenuItemBuilder::with_id("show", "显示 tiptip")
                    .build(app)?)
                .item(&tauri::menu::MenuItemBuilder::with_id("quit", "退出")
                    .build(app)?)
                .build()?;
            let tray = tauri::tray::TrayIconBuilder::new()
                .icon(tray_icon)
                .menu(&show_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("signal-dock") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    use tauri::tray::MouseButton;
                    use tauri::tray::MouseButtonState;
                    if let tauri::tray::TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("signal-dock") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Keep the tray alive for the lifetime of the app (drop would
            // remove the icon).
            let _ = tray;

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
