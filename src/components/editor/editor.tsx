import { useState } from "react";

import { Editor as MonacoEditor, DiffEditor } from "@monaco-editor/react";

import { useFileStore } from "../../store/filestore";

import { useThemeStore } from "../../store/themeStore";

import { useDiffStore } from "../../store/diffStore";

import { persistAcceptedChange } from "../../services/agentWorkspace";

import Terminal from "../terminal/terminal.tsx";



export default function Editor() {

    const files = useFileStore((state) => state.files);

    const activeFileId = useFileStore((state) => state.activeFileId);

    const updateFileContent = useFileStore((state) => state.updateFileContent);

    const markFileClean = useFileStore((state) => state.markFileClean);

    const resolvedTheme = useThemeStore((state) => state.resolvedTheme);

    const editorTheme = resolvedTheme === "light" ? "light" : "vs-dark";

    const activeFile = files.find((f) => f.id === activeFileId);

    // Find terminal file to keep it mounted in DOM
    const terminalFile = files.find((f) => f.kind === "terminal");

    const findDiffForEditorPath = useDiffStore((state) => state.findDiffForEditorPath);

    const clearPendingDiff = useDiffStore((state) => state.clearPendingDiff);
    
    // Subscribe to pendingDiffs to force re-render when diffs are added/removed
    useDiffStore((state) => state.pendingDiffs);

    // Get the root path from global variable set by sidebar
    const rootPath = globalThis.__PENCYL_PROJECT_ROOT_PATH ?? null;



    const [isApplying, setIsApplying] = useState(false);

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
                        theme={editorTheme}
                        path={activeFile.path}
                        value={activeFile.content}
                        onChange={(value) => updateFileContent(activeFile.id, value || "")}
                        options={{
                            minimap: { enabled: false },
                            fontSize: 14,
                            wordWrap: "on",
                            padding: { top: 16 }
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

