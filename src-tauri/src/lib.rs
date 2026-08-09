mod commands;
mod pty;

use std::fs::{self, File};
use std::path::PathBuf;

#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("Failed to create parent directories: {}", err))?;
    }
    File::create(&path).map_err(|err| format!("Failed to create file: {}", err)).map(|_| ())
}

#[tauri::command]
fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|err| format!("Failed to create directory: {}", err))
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let metadata = fs::metadata(&path).map_err(|err| format!("Failed to read metadata: {}", err))?;
    if metadata.is_dir() {
        fs::remove_dir_all(&path).map_err(|err| format!("Failed to remove directory: {}", err))
    } else {
        fs::remove_file(&path).map_err(|err| format!("Failed to remove file: {}", err))
    }
}

#[tauri::command]
fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|err| {
        if err.kind() == std::io::ErrorKind::CrossesDevices {
            "Cannot rename across different filesystems. Use copy and delete instead.".to_string()
        } else {
            format!("Failed to rename: {}", err)
        }
    })
}

#[tauri::command]
fn move_path(source_path: String, target_folder_path: String) -> Result<(), String> {
    let source = PathBuf::from(&source_path);
    let target_folder = PathBuf::from(&target_folder_path);

    if !target_folder.exists() {
        return Err(format!("Target folder does not exist: {}", target_folder_path));
    }
    if !target_folder.is_dir() {
        return Err(format!("Target path is not a directory: {}", target_folder_path));
    }

    let file_name = source.file_name()
        .ok_or_else(|| "Invalid source path: no filename".to_string())?;
    let destination = target_folder.join(file_name);

    fs::rename(&source, &destination).map_err(|err| {
        if err.kind() == std::io::ErrorKind::CrossesDevices {
            "Cannot move across different filesystems. Use copy and delete instead.".to_string()
        } else {
            format!("Failed to move: {}", err)
        }
    })
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
            create_file,
            create_dir,
            delete_path,
            rename_path,
            move_path,
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
