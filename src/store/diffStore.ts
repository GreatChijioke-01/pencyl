import { create } from "zustand";
import { normalizePath } from "../utils/pathUtils";

export interface PendingDiff {
  absolutePath: string;
  relativePath: string;
  originalContent: string;
  suggestedContent: string;
  createdAt: number;
}

interface DiffState {
  pendingDiffs: Record<string, PendingDiff>;
  setPendingDiff: (diff: PendingDiff) => void;
  clearPendingDiff: (filePath: string) => void;
  clearAllPendingDiffs: () => void;
  findDiffForEditorPath: (editorPath: string) => { key: string; diff: PendingDiff } | null;
  listPendingDiffs: () => PendingDiff[];
}

function diffKeyForPath(path: string): string {
  return normalizePath(path);
}

export const useDiffStore = create<DiffState>((set, get) => ({
  pendingDiffs: {},

  setPendingDiff: (diff) =>
    set((state) => ({
      pendingDiffs: {
        ...state.pendingDiffs,
        [diffKeyForPath(diff.absolutePath)]: diff,
      },
    })),

  clearPendingDiff: (filePath) =>
    set((state) => {
      // Use the normalized path as the key to ensure we clear the exact diff
      const key = diffKeyForPath(filePath);
      const updated = { ...state.pendingDiffs };
      delete updated[key];
      return { pendingDiffs: updated };
    }),


  clearAllPendingDiffs: () => set({ pendingDiffs: {} }),

  findDiffForEditorPath: (editorPath) => {
    const entries = Object.entries(get().pendingDiffs);
    const normalizedEditorPath = diffKeyForPath(editorPath);

    // First, try exact key match (most reliable)
    if (entries.some(([key]) => key === normalizedEditorPath)) {
      const [key, diff] = entries.find(([key]) => key === normalizedEditorPath)!;
      return { key, diff };
    }

    // Try matching absolutePath or relativePath
    for (const [key, diff] of entries) {
      const normalizedAbsolutePath = diffKeyForPath(diff.absolutePath);
      const normalizedRelativePath = diffKeyForPath(diff.relativePath);
      
      if (
        normalizedAbsolutePath === normalizedEditorPath ||
        normalizedRelativePath === normalizedEditorPath
      ) {
        return { key, diff };
      }
    }

    // As a last resort, try matching the editor path directly
    for (const [key, diff] of entries) {
      if (
        diffKeyForPath(editorPath) === key ||
        diffKeyForPath(editorPath) === diffKeyForPath(diff.absolutePath) ||
        diffKeyForPath(editorPath) === diffKeyForPath(diff.relativePath)
      ) {
        return { key, diff };
      }
    }

    return null;
  },

  listPendingDiffs: () => Object.values(get().pendingDiffs),
}));
