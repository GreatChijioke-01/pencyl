use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::command;

#[command]
pub fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|err| err.to_string())
}

#[command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    std::fs::write(&path, content).map_err(|err| err.to_string())
}

#[command]
pub fn read_dir(path: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();

    for entry in std::fs::read_dir(&path).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        if entry.file_type().map_err(|err| err.to_string())?.is_file() {
            files.push(entry.path().to_string_lossy().to_string());
        }
    }

    Ok(files)
}

#[derive(Serialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub children: Option<Vec<FileNode>>,
}

fn sanitize_path(path: &str) -> String {
    path.trim().trim_matches(|c| c == '"' || c == '\'').to_string()
}

fn file_name_or_path(path: &Path) -> String {
    path.file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

fn build_children(path: &Path) -> Result<Vec<FileNode>, String> {
    let mut children = Vec::new();
    let entries = std::fs::read_dir(path).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let child_path = entry.path();
        let file_type = entry.file_type().map_err(|e| e.to_string())?;

        children.push(FileNode {
            name: file_name_or_path(&child_path),
            path: child_path.to_string_lossy().to_string(),
            is_directory: file_type.is_dir(),
            children: None,
        });
    }

    children.sort_by(|left, right| match (left.is_directory, right.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => left.name.to_lowercase().cmp(&right.name.to_lowercase()),
    });

    Ok(children)
}

fn build_tree(path: &Path) -> Result<FileNode, String> {
    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let name = file_name_or_path(path);

    if metadata.is_file() {
        return Ok(FileNode {
            name,
            path: path.to_string_lossy().to_string(),
            is_directory: false,
            children: None,
        });
    }

    let mut children = Vec::new();
    let entries = std::fs::read_dir(path).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let child_path = entry.path();
        // skip hidden/system entries? keep all for now
        if let Ok(node) = build_tree(&child_path) {
            children.push(node);
        }
    }

    Ok(FileNode {
        name,
        path: path.to_string_lossy().to_string(),
        is_directory: true,
        children: Some(build_children(path)?),
    })
}

#[command]
pub fn read_dir_tree(path: String) -> Result<FileNode, String> {
    let sanitized_path = sanitize_path(&path);
    let p = Path::new(&sanitized_path);
    build_tree(p)
}

#[derive(Serialize, Clone)]
pub struct GitStatusEntry {
    pub path: String,
    pub status: String,
    pub staged: bool,
}

#[derive(Serialize, Clone)]
pub struct GitStatusSnapshot {
    pub root_path: String,
    pub changes: Vec<GitStatusEntry>,
    pub refreshed_at: u64,
    pub cached: bool,
    pub error: Option<String>,
}

struct CachedGitStatus {
    snapshot: GitStatusSnapshot,
    fetched_at: Instant,
}

static GIT_STATUS_CACHE: Lazy<Mutex<HashMap<String, CachedGitStatus>>> = Lazy::new(|| Mutex::new(HashMap::new()));
const GIT_STATUS_CACHE_TTL: Duration = Duration::from_millis(1200);

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn parse_git_status(output: &str) -> Vec<GitStatusEntry> {
    output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            if line.len() < 3 {
                return None;
            }

            let x = line.chars().next().unwrap_or(' ');
            let y = line.chars().nth(1).unwrap_or(' ');
            let path = line[3..].trim().to_string();

            let mut status = y.to_string();
            let mut staged = x != ' ' && x != '?';

            if staged && (y == ' ' || y == '.') {
                status = x.to_string();
            } else if y != ' ' && y != '.' {
                status = y.to_string();
            }

            if x == '?' && y == '?' {
                status = "?".to_string();
                staged = false;
            }

            Some(GitStatusEntry { path, status, staged })
        })
        .collect()
}

async fn run_git_status(root_path: String) -> Result<GitStatusSnapshot, String> {
    let sanitized_root = sanitize_path(&root_path);
    if sanitized_root.is_empty() {
        return Err("Git root path is empty".to_string());
    }

    if let Some(cached) = GIT_STATUS_CACHE.lock().get(&sanitized_root) {
        if cached.fetched_at.elapsed() <= GIT_STATUS_CACHE_TTL {
            let mut snapshot = cached.snapshot.clone();
            snapshot.cached = true;
            return Ok(snapshot);
        }
    }

    let command_root = sanitized_root.clone();
    let status_result = tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new("git")
            .current_dir(&command_root)
            .args(["status", "--porcelain"])
            .output()
            .map_err(|err| err.to_string())?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let error = if output.status.success() {
            None
        } else {
            Some(if stderr.is_empty() {
                "git status failed".to_string()
            } else {
                stderr
            })
        };

        Ok::<_, String>((parse_git_status(&stdout), error))
    })
    .await
    .map_err(|err| err.to_string())??;

    let snapshot = GitStatusSnapshot {
        root_path: sanitized_root.clone(),
        changes: status_result.0,
        refreshed_at: now_millis(),
        cached: false,
        error: status_result.1,
    };

    GIT_STATUS_CACHE.lock().insert(
        sanitized_root,
        CachedGitStatus {
            snapshot: snapshot.clone(),
            fetched_at: Instant::now(),
        },
    );

    Ok(snapshot)
}

#[command]
pub async fn git_status_snapshot(root_path: String) -> Result<GitStatusSnapshot, String> {
    run_git_status(root_path).await
}

#[command]
pub fn run_shell_command(command: String) -> Result<String, String> {
    let output = if cfg!(windows) {
        std::process::Command::new("cmd")
            .args(["/C", &command])
            .output()
            .map_err(|err| err.to_string())?
    } else {
        std::process::Command::new("sh")
            .arg("-c")
            .arg(&command)
            .output()
            .map_err(|err| err.to_string())?
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let mut result = String::new();

    if !stdout.is_empty() {
        result.push_str(&stdout);
    }
    if !stderr.is_empty() {
        if !result.is_empty() {
            result.push('\n');
        }
        result.push_str(&stderr);
    }

    Ok(result)
}
