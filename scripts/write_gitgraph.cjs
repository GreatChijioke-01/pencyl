const fs = require('fs');
const content = `import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function GitGraph() {
  const [log, setLog] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLog = async () => {
    const rootPath = (globalThis as any).__PENCYL_PROJECT_ROOT_PATH as string | undefined;
    if (!rootPath) {
      setLog("No folder selected. Open a folder to view git history.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Use git -C to change directory (avoids Windows cd /D path issues)
      const result = await invoke("run_shell_command", {
        command: \`git -C "\${rootPath}" log --oneline --graph --all --decorate 2>&1\`,
      });
      const output = result as string;
      if (output.includes("fatal: not a git repository")) {
        setLog("Not a git repository. Initialize with \`git init\` to start tracking.");
      } else {
        setLog(output || "No commits yet.");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLog();
  }, []);

  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      background: "var(--surface-color)"
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 16px",
        borderBottom: "1px solid var(--border-color)"
      }}>
        <span style={{
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--muted-text-color)"
        }}>GIT GRAPH</span>
        <button
          className="sc-action-btn"
          onClick={fetchLog}
          style={{ fontSize: "11px", padding: "4px 10px" }}
        >
          Refresh
        </button>
      </div>
      <div style={{
        flex: 1,
        overflow: "auto",
        padding: "16px",
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: "13px",
        lineHeight: 1.6,
        color: "var(--text-color)",
        whiteSpace: "pre-wrap"
      }}>
        {loading ? (
          <span style={{ color: "var(--muted-text-color)" }}>Loading git log...</span>
        ) : error ? (
          <span style={{ color: "#f44336" }}>Error: {error}</span>
        ) : (
          log
        )}
      </div>
  );
}
`;
fs.writeFileSync('d:/Rust/pencyl-ai/src/components/source_control/GitGraph.tsx', content, 'utf8');
console.log('Written successfully');
