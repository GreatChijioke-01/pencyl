use tauri::command;
use std::fs;
use std::path::Path;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[allow(dead_code)]
#[command]
pub fn write_ai_code(path: String, content: String) -> Result<String, String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    match fs::write(&path, content) {
        Ok(_) => Ok(format!("Successfully wrote to {}", path)),
        Err(e) => Err(format!("Failed to write file: {}", e.to_string())),
    }
}

#[allow(dead_code)]
#[command]
pub fn execute_terminal_command(command_string: String, current_dir: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let mut process = Command::new("cmd");
    #[cfg(not(target_os = "windows"))]
    let mut process = Command::new("sh");

    #[cfg(target_os = "windows")]
    process.arg("/C").arg(&command_string).creation_flags(0x08000000);
    #[cfg(not(target_os = "windows"))]
    process.arg("-c").arg(&command_string);

    let output = process.current_dir(current_dir).output();

    match output{
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            Ok(format!("STDOUT:\n{}\nSTDERR:\n{}", stdout, stderr))
        }
        Err(e) => Err(format!("Execution failed: {}", e.to_string()))
    }
}