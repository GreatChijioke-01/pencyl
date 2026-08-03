import { invoke } from "@tauri-apps/api/core";

export async function readFileContent(path: string): Promise<string> {
  return (await invoke("read_file", { path })) as string;
}

export async function writeFileContent(path: string, content: string): Promise<void> {
  await invoke("write_file", { path, content });
}

export async function createFile(path: string): Promise<void> {
  await invoke("create_file", { path });
}

export async function createDir(path: string): Promise<void> {
  await invoke("create_dir", { path });
}

export async function deletePath(path: string): Promise<void> {
  await invoke("delete_path", { path });
}

export async function renamePath(oldPath: string, newPath: string): Promise<void> {
  await invoke("rename_path", { oldPath, newPath });
}

export async function movePath(sourcePath: string, targetFolderPath: string): Promise<void> {
  await invoke("move_path", { sourcePath, targetFolderPath });
}

export async function runShellCommand(command: string): Promise<string> {
  return (await invoke("run_shell_command", { command })) as string;
}

export async function readDirContent(path: string): Promise<string[]> {
  return (await invoke("read_dir", { path })) as string[];
}

export interface FileNode {
  name: string;
  path: string;
  is_directory: boolean;
  children?: FileNode[] | null;
}

export interface GitStatusEntry {
  path: string;
  status: string;
  staged: boolean;
}

export interface GitStatusSnapshot {
  root_path: string;
  changes: GitStatusEntry[];
  refreshed_at: number;
  cached: boolean;
  error?: string | null;
}

export async function readDirTree(path: string): Promise<FileNode> {
  return (await invoke("read_dir_tree", { path })) as FileNode;
}

export async function readGitStatusSnapshot(rootPath: string): Promise<GitStatusSnapshot> {
  return (await invoke("git_status_snapshot", { rootPath })) as GitStatusSnapshot;
}
