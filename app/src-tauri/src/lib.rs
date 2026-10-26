pub mod agent;
pub mod commands;
pub mod diff;
pub mod documents;
pub mod git;
#[cfg(target_os = "macos")]
mod menu;
mod process;
pub mod pull_requests;
pub mod store;
pub mod workspaces;
/// Every UI operation goes through one dispatcher, shared with the browser preview's bridge.
#[tauri::command]
async fn call(command: String, args: serde_json::Value) -> store::Result<serde_json::Value> {
    tauri::async_runtime::spawn_blocking(move || commands::execute(&command, args))
        .await
        .map_err(|e| e.to_string())?
}
/// The native menu follows the language the interface was opened in. Only macOS has one: on
/// Windows a menu would be a bar inside the window, and the interface covers it all.
#[tauri::command]
fn set_menu_language(app: tauri::AppHandle, language: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    menu::set(&app, &language).map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "macos"))]
    let _ = (app, language);
    Ok(())
}
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(target_os = "macos")]
            menu::install(app)?;
            #[cfg(feature = "diagnostic")]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![call, set_menu_language])
        .run(tauri::generate_context!())
        .expect("failed to start Trama");
}
