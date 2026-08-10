import { useCallback, useMemo, useState, useRef, useEffect } from "react";

import { Editor as MonacoEditor, DiffEditor, type Monaco } from "@monaco-editor/react";

import { useFileStore } from "../../store/filestore";

import { useThemeStore } from "../../store/themeStore";

import { useDiffStore } from "../../store/diffStore";

import { useEditorStore, detectLanguageFromPath, detectLineEnding } from "../../store/editorStore";

import { persistAcceptedChange } from "../../services/agentWorkspace";

import Terminal from "../terminal/terminal.tsx";



export default function Editor() {

    const files = useFileStore((state) => state.files);

    const activeFileId = useFileStore((state) => state.activeFileId);

    const updateFileContent = useFileStore((state) => state.updateFileContent);

    const markFileClean = useFileStore((state) => state.markFileClean);

    const resolvedTheme = useThemeStore((state) => state.resolvedTheme);

    const editorTheme = resolvedTheme === "light" ? "light" : resolvedTheme === "highContrast" ? "hc-black" : "vs-dark";

    const activeFile = files.find((f) => f.id === activeFileId);
    
    // Editor store actions
    const setCursorPosition = useEditorStore((state) => state.setCursorPosition);
    const setSelection = useEditorStore((state) => state.setSelection);
    const clearSelection = useEditorStore((state) => state.clearSelection);
    const setActiveLanguage = useEditorStore((state) => state.setActiveLanguage);
    const setLineEnding = useEditorStore((state) => state.setLineEnding);
    
    // Monaco editor instance ref
    const monacoEditorRef = useRef<any>(null);
    const monacoInstanceRef = useRef<Monaco | null>(null);

    // Find terminal file to keep it mounted in DOM
    const terminalFile = files.find((f) => f.kind === "terminal");

    const findDiffForEditorPath = useDiffStore((state) => state.findDiffForEditorPath);

    const clearPendingDiff = useDiffStore((state) => state.clearPendingDiff);
    
    // Subscribe to pendingDiffs to force re-render when diffs are added/removed
    useDiffStore((state) => state.pendingDiffs);

    // Get the root path from global variable set by sidebar
    const rootPath = globalThis.__PENCYL_PROJECT_ROOT_PATH ?? null;

    const editorLanguage = useMemo(() => {
        const lowerPath = activeFile?.path.toLowerCase() ?? "";
        if (lowerPath.endsWith(".tsx") || lowerPath.endsWith(".ts")) {
            return "typescript";
        }
        if (lowerPath.endsWith(".jsx") || lowerPath.endsWith(".js")) {
            return "javascript";
        }

        return "typescript";
    }, [activeFile?.path]);

    // Handle Monaco editor mount to capture editor instance
    const handleEditorMount = useCallback((editor: any, monaco: Monaco) => {
      monacoEditorRef.current = editor;
      monacoInstanceRef.current = monaco;
      
      // Update language and line ending when editor mounts
      if (activeFile) {
        const language = detectLanguageFromPath(activeFile.path);
        setActiveLanguage(language);
        const lineEnding = detectLineEnding(activeFile.content);
        setLineEnding(lineEnding);
      }
      
      // Listen to cursor position changes
      editor.onDidChangeCursorPosition(() => {
        const position = editor.getPosition();
        if (position) {
          setCursorPosition(position.lineNumber, position.column);
        }
      });
      
      // Listen to selection changes
      editor.onDidChangeCursorSelection(() => {
        const selection = editor.getSelection();
        if (selection) {
          const start = selection.getStartPosition();
          const end = selection.getEndPosition();
          if (start && end) {
            // Only update if there's an actual selection
            if (start.lineNumber !== end.lineNumber || start.column !== end.column) {
              setSelection(
                start.lineNumber,
                start.column,
                end.lineNumber,
                end.column
              );
            } else {
              clearSelection();
            }
          }
        } else {
          clearSelection();
        }
      });
      
      // Initial cursor position
      const position = editor.getPosition();
      if (position) {
        setCursorPosition(position.lineNumber, position.column);
      }
    }, [activeFile, setCursorPosition, setSelection, clearSelection, setActiveLanguage, setLineEnding]);

    // Separate handler for DiffEditor (has different type signature)
    const handleDiffEditorMount = useCallback((editor: any, monaco: Monaco) => {
      monacoEditorRef.current = editor;
      monacoInstanceRef.current = monaco;
      
      if (activeFile) {
        const language = detectLanguageFromPath(activeFile.path);
        setActiveLanguage(language);
        const lineEnding = detectLineEnding(activeFile.content);
        setLineEnding(lineEnding);
      }
    }, [activeFile, setActiveLanguage, setLineEnding]);

    // Handle file switch - update language and line ending
    useEffect(() => {
      if (activeFile) {
        const language = detectLanguageFromPath(activeFile.path);
        setActiveLanguage(language);
        const lineEnding = detectLineEnding(activeFile.content);
        setLineEnding(lineEnding);
        
        // If editor exists, update its model language
        if (monacoEditorRef.current && monacoInstanceRef.current) {
          const model = monacoEditorRef.current.getModel();
          if (model) {
            const monacoLanguage = language.toLowerCase();
            model.setLanguage(monacoLanguage);
          }
        }
      }
    }, [activeFile, setActiveLanguage, setLineEnding]);

    const [isApplying, setIsApplying] = useState(false);

    const handleMonacoBeforeMount = useCallback((monaco: Monaco) => {
        const jsxRuntimeTypes = [
            "declare namespace JSX {",
            "  interface IntrinsicElements {",
            "    [elementName: string]: any;",
            "  }",
            "}",
            "declare module 'react/jsx-runtime' {",
            "  export const Fragment: any;",
            "  export function jsx(type: any, props: any, key?: any): any;",
            "  export function jsxs(type: any, props: any, key?: any): any;",
            "}",
            "declare module 'react/jsx-dev-runtime' {",
            "  export const Fragment: any;",
            "  export function jsxDEV(type: any, props: any, key?: any, isStatic?: boolean, source?: any, self?: any): any;",
            "}",
        ].join("\n");

        monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
            jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
            target: monaco.languages.typescript.ScriptTarget.ESNext,
            module: monaco.languages.typescript.ModuleKind.ESNext,
            moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
            allowSyntheticDefaultImports: true,
            esModuleInterop: true,
            allowNonTsExtensions: true,
            resolveJsonModule: true,
            noEmit: true,
            strict: true,
            lib: ["esnext", "dom", "dom.iterable"],
        });

        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: true,
            noSyntaxValidation: true,
        });

        monaco.languages.typescript.typescriptDefaults.addExtraLib(jsxRuntimeTypes, "ts:jsx-runtime.d.ts");

        monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
            jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
            target: monaco.languages.typescript.ScriptTarget.ESNext,
            module: monaco.languages.typescript.ModuleKind.ESNext,
            moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
            allowSyntheticDefaultImports: true,
            esModuleInterop: true,
            allowNonTsExtensions: true,
            resolveJsonModule: true,
            noEmit: true,
            checkJs: false,
            lib: ["esnext", "dom", "dom.iterable"],
        });

        monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: true,
            noSyntaxValidation: true,
        });

        monaco.languages.typescript.javascriptDefaults.addExtraLib(jsxRuntimeTypes, "js:jsx-runtime.d.ts");
    }, []);

    // If no active file, show empty state (prioritized over terminal)
    if (!activeFile) {
      return (
        <div className="editor-container" style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#666"
        }}>
          <h2>No file open</h2>
        </div>
      );
    }

    // If active file is terminal, render terminal
    if (activeFile?.kind === "terminal") {
      return (
        <div className="editor-container" style={{height: "100%", width: "100%", overflow: "hidden", display: "flex", flexDirection: "column"}}>
          <div style={{ flex: 1, position: "relative" }}>
            <Terminal cwd={rootPath ?? activeFile.path} />
          </div>
        </div>
      );
    }

    const diffMatch = activeFile.kind === "file" ? findDiffForEditorPath(activeFile.path) : null;

    const suggestedCode = diffMatch?.diff.suggestedContent;

    const originalCode = diffMatch?.diff.originalContent ?? activeFile.content;



    const handleAccept = async () => {

        if (!suggestedCode || !diffMatch) return;



        setIsApplying(true);

        try {

            updateFileContent(activeFile.id, suggestedCode);

            await persistAcceptedChange(activeFile.path, suggestedCode);

            markFileClean(activeFile.id);

            clearPendingDiff(diffMatch.key);

            window.dispatchEvent(new CustomEvent("pencyl:refresh-tree"));

        } catch (err) {

            console.error("Failed to apply AI change:", err);

        } finally {

            setIsApplying(false);

        }

    };



    const handleReject = () => {

        if (diffMatch) {

            clearPendingDiff(diffMatch.key);
            window.dispatchEvent(new CustomEvent("pencyl:refresh-tree"));

        }

    };


    return(

        <div className="editor-container" style={{height: "100%", width: "100%", overflow: "hidden", display: "flex", flexDirection: "column"}}>

            {suggestedCode && (

                <div style={{ background: "var(--accent, #3b82f6)", color: "#fff", padding: "8px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>

                    <span>AI suggested changes for <strong>{activeFile.path}</strong></span>

                    <div>

                        <button

                            onClick={() => void handleAccept()}

                            disabled={isApplying}

                            style={{ background: "#22c55e", border: "1px solid #16a34a", color: "white", padding: "4px 12px", borderRadius: "4px", marginRight: "8px", cursor: isApplying ? "wait" : "pointer", fontWeight: "bold", opacity: isApplying ? 0.7 : 1 }}

                        >

                            {isApplying ? "Applying..." : "Accept"}

                        </button>

                        <button onClick={handleReject} style={{ background: "#ef4444", border: "1px solid #dc2626", color: "white", padding: "4px 12px", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>Reject</button>

                    </div>

                </div>

            )}



            <div style={{ flex: 1, position: "relative" }}>

                {suggestedCode ? (
                    <DiffEditor
                        height="100%"
                        theme={editorTheme}
                        original={originalCode}
                        modified={suggestedCode}
                        onMount={handleDiffEditorMount}
                        options={{
                            minimap: { enabled: false },
                            fontSize: 14,
                            wordWrap: "on",
                            renderSideBySide: true,
                            readOnly: true
                        }}
                    />
                ) : (
                    <MonacoEditor
                        height="100%"
                        width="100%"
                        beforeMount={handleMonacoBeforeMount}
                        onMount={handleEditorMount}
                        language={editorLanguage}
                        theme={editorTheme}
                        path={activeFile.path}
                        value={activeFile.content}
                        onChange={(value) => updateFileContent(activeFile.id, value || "")}
                        options={{
                            minimap: { enabled: false },
                            fontSize: 14,
                            wordWrap: "on",
                            padding: { top: 16 },
                            renderValidationDecorations: "off"
                        }}
                    />
                )}

            </div>

            {terminalFile && activeFileId !== terminalFile.id && (
              <div style={{ display: "none", height: "100%", width: "100%", overflow: "hidden" }}>
                <Terminal cwd={rootPath ?? terminalFile.path} />
              </div>
            )}

        </div>

    );

}

