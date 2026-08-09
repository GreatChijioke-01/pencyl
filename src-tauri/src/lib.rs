mod commands;
mod pty;

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::files::read_dir,
            commands::files::read_file,
            commands::files::write_file,
            commands::files::run_shell_command,
            commands::files::read_dir_tree,
            commands::files::git_status_snapshot,
            commands::files::search_files,
            commands::files::create_file,
            commands::files::create_dir,
            commands::files::delete_path,
            commands::files::rename_path,
            commands::files::move_path,
            get_app_version,
            commands::ai_handler::write_ai_code,
            commands::ai_handler::execute_terminal_command,
            pty::spawn_pty,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
