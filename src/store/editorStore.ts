import { create } from "zustand";

// Types for AI status
export type AIStatusState = "idle" | "thinking" | "applying" | "offline";

// Types for line endings
export type LineEnding = "LF" | "CRLF" | "CR";

// Types for encoding
export type TextEncoding = "UTF-8" | "UTF-16" | "UTF-32" | "ASCII" | "ISO-8859-1";

// Types for language modes
export type LanguageMode = 
  | "TypeScript"
  | "JavaScript"
  | "Python"
  | "Java"
  | "C++"
  | "C"
  | "C#"
  | "Go"
  | "Rust"
  | "Swift"
  | "Kotlin"
  | "Ruby"
  | "PHP"
  | "HTML"
  | "CSS"
  | "JSON"
  | "YAML"
  | "Markdown"
  | "SQL"
  | "Bash"
  | "Plain Text"
  | string;

interface Diagnostic {
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
}

interface CursorPosition {
  line: number;
  column: number;
}

interface SelectionInfo {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  characterCount: number;
}

interface FormattingInfo {
  useSpaces: boolean;
  tabSize: number;
}

interface AIStatus {
  state: AIStatusState;
  activeModel: string;
}

interface EditorState {
  // Cursor and selection
  cursorPosition: CursorPosition;
  selection: SelectionInfo | null;
  
  // Document info
  activeLanguage: LanguageMode;
  lineEnding: LineEnding;
  encoding: TextEncoding;
  
  // Formatting
  formatting: FormattingInfo;
  
  // Diagnostics
  diagnostics: Diagnostic[];
  
  // AI status
  aiStatus: AIStatus;
  
  // Actions
  setCursorPosition: (line: number, column: number) => void;
  setSelection: (startLine: number, startColumn: number, endLine: number, endColumn: number) => void;
  clearSelection: () => void;
  
  setActiveLanguage: (language: LanguageMode) => void;
  setLineEnding: (lineEnding: LineEnding) => void;
  setEncoding: (encoding: TextEncoding) => void;
  
  setUseSpaces: (useSpaces: boolean) => void;
  setTabSize: (tabSize: number) => void;
  
  setDiagnostics: (diagnostics: Diagnostic[]) => void;
  addDiagnostic: (diagnostic: Diagnostic) => void;
  clearDiagnostics: () => void;
  
  setAIStatus: (state: AIStatusState, activeModel?: string) => void;
  setAIModel: (model: string) => void;
  
  // Computed values
  getSelectionCharacterCount: () => number;
  getErrorCount: () => number;
  getWarningCount: () => number;
  isSelectionActive: () => boolean;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  // Initial state
  cursorPosition: { line: 1, column: 1 },
  selection: null,
  
  activeLanguage: "TypeScript",
  lineEnding: "LF",
  encoding: "UTF-8",
  
  formatting: {
    useSpaces: true,
    tabSize: 2,
  },
  
  diagnostics: [],
  
  aiStatus: {
    state: "idle",
    activeModel: "",
  },
  
  // Cursor and selection actions
  setCursorPosition: (line, column) => {
    set({ cursorPosition: { line, column } });
  },
  
  setSelection: (startLine, startColumn, endLine, endColumn) => {
    const charCount = Math.abs(
      (endLine - startLine) * 1000 + (endColumn - startColumn)
    );
    set({
      selection: {
        startLine,
        startColumn,
        endLine,
        endColumn,
        characterCount: charCount,
      },
    });
  },
  
  clearSelection: () => {
    set({ selection: null });
  },
  
  // Document info actions
  setActiveLanguage: (language) => {
    set({ activeLanguage: language });
  },
  
  setLineEnding: (lineEnding) => {
    set({ lineEnding: lineEnding });
  },
  
  setEncoding: (encoding) => {
    set({ encoding: encoding });
  },
  
  // Formatting actions
  setUseSpaces: (useSpaces) => {
    set((state) => ({
      formatting: { ...state.formatting, useSpaces },
    }));
  },
  
  setTabSize: (tabSize) => {
    set((state) => ({
      formatting: { ...state.formatting, tabSize },
    }));
  },
  
  // Diagnostics actions
  setDiagnostics: (diagnostics) => {
    set({ diagnostics });
  },
  
  addDiagnostic: (diagnostic) => {
    set((state) => ({
      diagnostics: [...state.diagnostics, diagnostic],
    }));
  },
  
  clearDiagnostics: () => {
    set({ diagnostics: [] });
  },
  
  // AI status actions
  setAIStatus: (state, activeModel) => {
    set((prev) => ({
      aiStatus: {
        state,
        activeModel: activeModel ?? prev.aiStatus.activeModel,
      },
    }));
  },
  
  setAIModel: (model) => {
    set((state) => ({
      aiStatus: { ...state.aiStatus, activeModel: model },
    }));
  },
  
  // Computed values
  getSelectionCharacterCount: () => {
    const selection = get().selection;
    if (!selection) return 0;
    return selection.characterCount;
  },
  
  getErrorCount: () => {
    return get().diagnostics.filter((d) => d.severity === "error").length;
  },
  
  getWarningCount: () => {
    return get().diagnostics.filter((d) => d.severity === "warning").length;
  },
  
  isSelectionActive: () => {
    const selection = get().selection;
    return selection !== null && 
      (selection.startLine !== selection.endLine || 
       selection.startColumn !== selection.endColumn);
  },
}));

// Helper to detect language from file path
export const detectLanguageFromPath = (path: string): LanguageMode => {
  const lowerPath = path.toLowerCase();
  
  if (lowerPath.endsWith(".tsx")) return "TypeScript";
  if (lowerPath.endsWith(".ts")) return "TypeScript";
  if (lowerPath.endsWith(".jsx")) return "JavaScript";
  if (lowerPath.endsWith(".js")) return "JavaScript";
  if (lowerPath.endsWith(".py")) return "Python";
  if (lowerPath.endsWith(".java")) return "Java";
  if (lowerPath.endsWith(".cpp")) return "C++";
  if (lowerPath.endsWith(".c")) return "C";
  if (lowerPath.endsWith(".cs")) return "C#";
  if (lowerPath.endsWith(".go")) return "Go";
  if (lowerPath.endsWith(".rs")) return "Rust";
  if (lowerPath.endsWith(".swift")) return "Swift";
  if (lowerPath.endsWith(".kt")) return "Kotlin";
  if (lowerPath.endsWith(".rb")) return "Ruby";
  if (lowerPath.endsWith(".php")) return "PHP";
  if (lowerPath.endsWith(".html")) return "HTML";
  if (lowerPath.endsWith(".css")) return "CSS";
  if (lowerPath.endsWith(".json")) return "JSON";
  if (lowerPath.endsWith(".yaml") || lowerPath.endsWith(".yml")) return "YAML";
  if (lowerPath.endsWith(".md")) return "Markdown";
  if (lowerPath.endsWith(".sql")) return "SQL";
  if (lowerPath.endsWith(".sh") || lowerPath.endsWith(".bash")) return "Bash";
  
  return "Plain Text";
};

// Helper to detect line ending from content
export const detectLineEnding = (content: string): LineEnding => {
  const hasCRLF = content.includes("\r\n");
  const hasLF = content.includes("\n");
  const hasCR = content.includes("\r");
  
  if (hasCRLF) return "CRLF";
  if (hasCR) return "CR";
  if (hasLF) return "LF";
  
  return "LF"; // Default
};
