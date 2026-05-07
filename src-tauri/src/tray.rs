// System tray + popup window setup. Called from `lib.rs::run::setup`.
//
// Behaviour:
//   - Pre-creates a hidden `tray` popup window (340x280, frameless, transparent,
//     always-on-top, skip-taskbar). Cheaper than building it on first click.
//   - Tray left-click toggles the popup (anchored near the tray icon via
//     tauri-plugin-positioner's TrayCenter / TrayBottomCenter).
//   - Tray right-click shows a menu: "Open dashboard" / "Quit".
//   - Hide-on-blur is wired in lib.rs's on_window_event handler so the popup
//     dismisses when the user clicks elsewhere.

use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_positioner::{Position, WindowExt};

const POPUP_LABEL: &str = "tray";
const POPUP_W: f64 = 340.0;
const POPUP_H: f64 = 280.0;

pub fn init(app: &AppHandle) -> tauri::Result<()> {
    build_popup(app)?;
    build_tray(app)?;
    Ok(())
}

fn build_popup(app: &AppHandle) -> tauri::Result<()> {
    if app.get_webview_window(POPUP_LABEL).is_some() {
        return Ok(());
    }
    WebviewWindowBuilder::new(app, POPUP_LABEL, WebviewUrl::App("index.html".into()))
        .title("ccbar tray")
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .transparent(true)
        .visible(false)
        .inner_size(POPUP_W, POPUP_H)
        .build()?;
    Ok(())
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open_item = MenuItemBuilder::with_id("open", "Open dashboard").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit ccbar").build(app)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&open_item, &separator, &quit_item])
        .build()?;

    // Best icon source on Windows: the bundle .ico already declared in
    // tauri.conf.json — exposed at runtime via app.default_window_icon().
    // On macOS this should ideally be a monochrome template; deferred until
    // a Mac user actually needs it (LiveCheck shows the user is on Windows).
    let icon: Image = app
        .default_window_icon()
        .cloned()
        .unwrap_or_else(|| Image::new(&[], 0, 0));

    TrayIconBuilder::with_id("ccbar-tray")
        .icon(icon)
        .tooltip("ccbar — Claude Code usage")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Feed every tray event to the positioner plugin so it can
            // record the tray icon's screen rect — required before any
            // `move_window(TrayBottomCenter / TrayCenter)` call.
            tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);

            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(popup) = app.get_webview_window(POPUP_LABEL) {
                    match popup.is_visible() {
                        Ok(true) => {
                            let _ = popup.hide();
                        }
                        _ => {
                            // TrayCenter places the window's TOP at tray_y - window_height
                            // → window appears ABOVE the tray icon, which is what we want
                            // on Windows (taskbar at bottom) AND macOS (menubar at top —
                            // the plugin auto-flips to below if y goes negative).
                            // TrayBottomCenter places window's TOP at tray_y, which on
                            // Windows pushes the window off-screen below the taskbar.
                            let _ = popup.move_window(Position::TrayCenter);
                            let _ = popup.show();
                            let _ = popup.set_focus();
                        }
                    }
                }
            }
        })
        .build(app)?;
    Ok(())
}
