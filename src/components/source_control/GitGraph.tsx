import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { runShellCommand } from "../../services/fileService";
import "./git_view.css";

interface FileChange {
  path: string;
  status: string; // M, A, D, ?, etc.
  staged: boolean;
}

export default function GitGraph() {
  const [activeTab, setActiveTab] = useState<"changes" | "graph">("changes");
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [log, setLog] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");
  const [committing, setCommitting] = useState(false);
  const [pushing, setPushing] = useState(false);

  // Get and sanitize the root path (strip any accidental wrapping quotes)
  const getRootPath = (): string | null => {
    let path = (globalThis as any).__PENCYL_PROJECT_ROOT_PATH as string | undefined ?? null;
    if (path) {
      // Strip wrapping quotes if present (some dialog libraries may add them)
      path = path.replace(/^["']|["']$/g, "");
      // Also strip any extra whitespace
      path = path.trim();
    }
    return path;
  };

  // Build a git command. Uses git -C with NO extra quotes around the path.
  // The path should have quotes stripped already by getRootPath().
  // The Rust backend runs via cmd /C on Windows.
  const gitCommand = (subcommand: string): string => {
    const rootPath = getRootPath();
    if (!rootPath) return subcommand;
    // No extra quotes - cmd /C passes this to git cleanly
    return `git -C ${rootPath} ${subcommand}`;
  };

  // Show a status message that auto-clears after a delay
  const showMessage = useCallback((msg: string, type: "success" | "error" | "info" = "info") => {
    setMessage(msg);
    setMessageType(type);
    if (type !== "error") {
      setTimeout(() => {
        setMessage("");
      }, 5000);
    }
  }, []);

  // Parse `git status --porcelain` output
  const parseStatus = (output: string): FileChange[] => {
    const lines = output.trim().split("\n").filter(Boolean);
    return lines.map((line) => {
      // Porcelain format: XY filename
      // X = staging area status, Y = working tree status
      const x = line[0];
      const y = line[1];
      const path = line.substring(3).trim();

      // Determine the visible status
      let status = y;
      let staged = x !== " " && x !== "?";

      if (staged && (y === " " || y === ".")) {
        // Only staged, no working tree change
        status = x;
      } else if (y !== " " && y !== ".") {
        // Working tree change takes precedence for display
        status = y;
        // If also staged, we just show the working tree status but mark as staged too
      }

      // Untracked files
      if (x === "?" && y === "?") {
        status = "?";
        staged = false;
      }

      return { path, status, staged };
    });
  };

  const fetchChanges = async () => {
    const rootPath = getRootPath();
    if (!rootPath) {
      setChanges([]);
      showMessage("No folder selected. Open a folder to view changes.", "info");
      return;
    }

    try {
      const result = await runShellCommand(gitCommand(`status --porcelain`));
      if (result.includes("fatal: not a git repository")) {
        setChanges([]);
        showMessage("Not a git repository.", "info");
      } else if (result.includes("fatal:")) {
        setChanges([]);
        showMessage("Git error: " + result, "error");
      } else {
        setChanges(parseStatus(result));
      }
    } catch (err) {
      setChanges([]);
      showMessage("Failed to fetch changes: " + String(err), "error");
    }
  };

  const fetchLog = useCallback(async () => {
    const rootPath = getRootPath();
    if (!rootPath) {
      setLog("No folder selected. Open a folder to view git history.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await runShellCommand(gitCommand(`log --oneline --graph --all --decorate`));
      if (result.includes("fatal: not a git repository")) {
        setLog("Not a git repository. Initialize with `git init` to start tracking.");
      } else {
        setLog(result || "No commits yet.");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    fetchChanges();
    fetchLog();
  }, [fetchLog]);

  useEffect(() => {
    fetchChanges();
    fetchLog();
  }, [fetchLog]);

  const handleCommit = async () => {
    const rootPath = getRootPath();
    if (!rootPath) {
      showMessage("No folder selected.", "error");
      return;
    }
    if (!commitMessage.trim()) {
      showMessage("Please enter a commit message.", "error");
      return;
    }

    setCommitting(true);
    try {
      // Stage all changes first
      const stageResult = await runShellCommand(gitCommand(`add -A`));
      if (stageResult.includes("fatal:")) {
        showMessage("Stage failed: " + stageResult, "error");
        setCommitting(false);
        return;
      }
      // Write commit message to a temp file at project root via Tauri IPC
      // (bypasses shell entirely for the file write)
      await invoke("write_file", {
        path: `${rootPath}/.pencyl_commit_msg`,
        content: commitMessage
      });
      // Use -F to read message from file. NO quotes around path (no spaces).
      const result = await runShellCommand(gitCommand(`commit -F ${rootPath}/.pencyl_commit_msg`));
      // Clean up temp file
      await runShellCommand(`del ${rootPath}\\.pencyl_commit_msg`);
      if (result.includes("nothing to commit") || result.includes("no changes added")) {
        showMessage("Nothing to commit. Working tree clean.", "info");
      } else if (result.includes("error:") || result.includes("fatal:")) {
        showMessage("Commit failed: " + result, "error");
      } else {
        showMessage("Committed successfully!", "success");
        setCommitMessage("");
        refreshAll();
      }
    } catch (err) {
      showMessage("Commit failed: " + String(err), "error");
    } finally {
      setCommitting(false);
    }
  };

  const handlePush = async () => {
    const rootPath = getRootPath();
    if (!rootPath) {
      showMessage("No folder selected.", "error");
      return;
    }

    setPushing(true);
    try {
      const result = await runShellCommand(
        gitCommand(`push`)
      );
      if (result.includes("fatal:")) {
        showMessage("Push failed: " + result, "error");
      } else {
        showMessage("Pushed successfully!", "success");
      }
    } catch (err) {
      showMessage("Push failed: " + String(err), "error");
    } finally {
      setPushing(false);
    }
  };

  const getStatusChar = (change: FileChange): string => {
    switch (change.status) {
      case "M": return "M";
      case "A": return "A";
      case "D": return "D";
      case "?": return "U";
      default: return change.status;
    }
  };

  return (
    <div className="sc-container">
      {/* Tab Bar */}
      <div className="sc-tabs">
        <button
          className={`sc-tab ${activeTab === "changes" ? "active" : ""}`}
          onClick={() => setActiveTab("changes")}
        >
          Changes
          {changes.length > 0 && (
            <span className="sc-tab-badge">{changes.length}</span>
          )}
        </button>
        <button
          className={`sc-tab ${activeTab === "graph" ? "active" : ""}`}
          onClick={() => setActiveTab("graph")}
        >
          Graph
        </button>
      </div>

      {/* Status Message */}
      {message && (
        <div className={`sc-message ${messageType}`}>
          {message}
        </div>
      )}

      {/* Changes Tab */}
      {activeTab === "changes" && (
        <>
          <div className="sc-header">
            <span className="sc-header-title">CHANGES</span>
            <div className="sc-actions">
              <button className="sc-action-btn" onClick={fetchChanges}>
                Refresh
              </button>
            </div>
          </div>

          <div className="sc-files">
            {changes.length === 0 ? (
              <div className="sc-empty">
                {getRootPath() ? "No changes detected." : "Open a folder to get started."}
              </div>
            ) : (
              changes.map((change, index) => (
                <div key={`${change.path}-${index}`} className="sc-file-item">
                  <span className={`sc-file-status ${getStatusChar(change)}`}>
                    {getStatusChar(change)}
                  </span>
                  <span className="sc-file-name" title={change.path}>
                    {change.path}
                  </span>
                  {change.staged && (
                    <span className="sc-file-staged" title="Staged">S</span>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Commit Area */}
          <div className="sc-commit-area">
            <textarea
              className="sc-commit-input"
              placeholder="Commit message..."
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              rows={2}
              disabled={committing}
            />
            <div className="sc-commit-actions">
              <button
                className="sc-action-btn primary"
                onClick={handleCommit}
                disabled={committing || !commitMessage.trim()}
              >
                {committing ? "Committing..." : "Commit"}
              </button>
              <button
                className="sc-action-btn"
                onClick={handlePush}
                disabled={pushing}
              >
                {pushing ? "Pushing..." : "Push"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Graph Tab */}
      {activeTab === "graph" && (
        <div className="sc-graph-area">
          <div className="sc-header">
            <span className="sc-header-title">GIT GRAPH</span>
            <div className="sc-actions">
              <button className="sc-action-btn" onClick={fetchLog}>
                Refresh
              </button>
            </div>
          </div>
          <div className="sc-graph-content">
            {loading ? (
              <span style={{ color: "var(--muted-text-color)" }}>Loading git log...</span>
            ) : error ? (
              <span style={{ color: "#f44336" }}>Error: {error}</span>
            ) : (
              log
            )}
          </div>
        </div>
      )}
    </div>
  );
}

