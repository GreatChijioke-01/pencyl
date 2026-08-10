import { invoke } from "@tauri-apps/api/core";
import { getBasename, normalizePath, resolveProjectPath } from "../utils/pathUtils";
import { createFile, readFileContent } from "./fileService";
import { useFileStore } from "../store/filestore";
import type { PendingDiff } from "../store/diffStore";

const MAX_CONTEXT_CHARS = 40_000;

export type WorkspaceContext = {
  projectRoot: string | null;
  activeFilePath: string | null;
  activeFileContent: string | null;
  openFiles: Array<{ path: string; isDirty: boolean }>;
};

export function buildAgentSystemPrompt(context: WorkspaceContext, customInstructions?: string): string {
  const lines = [
    "You are an agentic coding assistant embedded in the Pencyl desktop code editor.",
    "You can modify files and request one terminal command at a time.",
    "",
    "CRITICAL RULES:",
    "- Prefer file edits over terminal commands.",
    "- Return complete file contents inside FILE_CONTENT blocks (not partial diffs).",
    "- Use project-relative paths in [FILE_PATH: ...] whenever possible.",
    "- Do NOT run git init if a repository may already exist.",
    "- Never request interactive programs (nano, vim, top, htop, less, more, watch, etc.).",
    "- Only use [RUN_COMMAND: ...] when a command is truly required.",
    "- Each terminal command will require explicit user approval before execution.",
    "",
    "OUTPUT FORMAT:",
    "1) Code changes:",
    "   [FILE_PATH: path/to/file]",
    "   [FILE_CONTENT]",
    "   ...full file content...",
    "   [/FILE_CONTENT]",
    "2) Terminal command (optional, one per response):",
    "   [RUN_COMMAND: your command here]",
    "",
  ];

  if (context.projectRoot) {
    lines.push(`Project root: ${context.projectRoot}`);
  } else {
    lines.push("Project root: <none — ask the user to open a folder first for file writes>");
  }

  if (context.openFiles.length > 0) {
    lines.push("");
    lines.push("Open files:");
    for (const file of context.openFiles) {
      lines.push(`- ${file.path}${file.isDirty ? " (unsaved changes)" : ""}`);
    }
  }

  if (context.activeFilePath && context.activeFileContent != null) {
    lines.push("");
    lines.push(`Active file: ${context.activeFilePath}`);
    lines.push("Active file content:");
    lines.push("```");
    lines.push(truncateContent(context.activeFileContent));
    lines.push("```");
  }

  if (customInstructions && customInstructions.trim().length > 0) {
    lines.push("");
    lines.push("CUSTOM INSTRUCTIONS FROM USER:");
    lines.push(customInstructions.trim());
  }

  return lines.join("\n");
}

function truncateContent(content: string): string {
  if (content.length <= MAX_CONTEXT_CHARS) return content;
  return `${content.slice(0, MAX_CONTEXT_CHARS)}\n\n... [truncated ${content.length - MAX_CONTEXT_CHARS} characters]`;
}

export async function openFileInEditor(absolutePath: string, content?: string): Promise<void> {
  const store = useFileStore.getState();
  const existing = store.files.find((file) => normalizePath(file.path) === normalizePath(absolutePath));

  if (existing) {
    store.updateActiveFile(existing.id);
    window.dispatchEvent(new CustomEvent("pencyl:show-file-in-tree", { detail: absolutePath }));
    return;
  }

  const fileContent =
    content ??
    (await readFileContent(absolutePath).catch(() => ""));

  store.addFile({
    id: absolutePath,
    path: absolutePath,
    name: getBasename(absolutePath),
    content: fileContent,
    isDirty: false,
    kind: "file",
  });

  window.dispatchEvent(new CustomEvent("pencyl:show-file-in-tree", { detail: absolutePath }));
  window.dispatchEvent(new CustomEvent("pencyl:refresh-tree"));
}

export async function applyAgentFileChanges(
  diffs: Array<{ path: string; content: string }>,
  projectRoot: string | null,
  setPendingDiff: (diff: PendingDiff) => void
): Promise<{ applied: string[]; skipped: string[] }> {
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const diff of diffs) {
    const absolutePath = resolveProjectPath(diff.path, projectRoot);
    if (!absolutePath) {
      skipped.push(diff.path);
      continue;
    }

    let originalContent = "";
    try {
      originalContent = await readFileContent(absolutePath);
    } catch {
      originalContent = "";
    }

    setPendingDiff({
      absolutePath,
      relativePath: diff.path,
      originalContent,
      suggestedContent: diff.content,
      createdAt: Date.now(),
    });

    await openFileInEditor(absolutePath, originalContent);
    applied.push(diff.path);
  }

  return { applied, skipped };
}

export async function executeAgentCommand(
  command: string,
  projectRoot: string
): Promise<string> {
  return String(
    await invoke("execute_terminal_command", {
      commandString: command,
      currentDir: projectRoot,
    })
  );
}

export async function persistAcceptedChange(path: string, content: string): Promise<void> {
  try {
    await readFileContent(path);
  } catch {
    // File doesn't exist, that's fine - we'll create it
    try {
      await createFile(path);
    } catch {
      // If we can't create the file, that's also fine - write_ai_code will create it
    }
  }

  await invoke("write_ai_code", { path, content });
}

