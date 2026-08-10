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

export interface SearchFileResult {
  name: string;
  path: string;
  relative_path: string;
  is_directory: boolean;
  score?: number;
}

export async function searchFiles(rootPath: string, query: string, maxResults?: number): Promise<SearchFileResult[]> {
  return (await invoke("search_files", { rootPath, query, maxResults })) as SearchFileResult[];
}

export interface GitBranchInfo {
  branch: string;
  has_uncommitted_changes: boolean;
  root_path: string;
  error?: string | null;
}

export async function getCurrentGitBranch(rootPath: string): Promise<GitBranchInfo> {
  return (await invoke("get_git_branch", { rootPath })) as GitBranchInfo;
}
