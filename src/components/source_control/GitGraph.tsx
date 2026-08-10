import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { readGitStatusSnapshot, runShellCommand } from "../../services/fileService";
import "./git_view.css";

interface FileChange {
  path: string;
  status: string;
  staged: boolean;
}

export default function GitGraph() {
  const [activeTab, setActiveTab] = useState<"changes" | "graph">("changes");
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [log, setLog] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");
  const [committing, setCommitting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [logLoaded, setLogLoaded] = useState(false);

  const statusTimerRef = useRef<number | null>(null);
  const inFlightStatusRef = useRef(false);
  const queuedStatusRef = useRef(false);

  const getRootPath = useCallback((): string | null => {
    let path = (globalThis as any).__PENCYL_PROJECT_ROOT_PATH as string | undefined ?? null;
    if (path) {
      path = path.replace(/^["']|["']$/g, "");
      path = path.trim();
    }
    return path;
  }, []);

  const gitCommand = useCallback((subcommand: string): string => {
    const rootPath = getRootPath();
    if (!rootPath) return subcommand;
    return `git -C ${rootPath} ${subcommand}`;
  }, [getRootPath]);

  const showMessage = useCallback((msg: string, type: "success" | "error" | "info" = "info") => {
    setMessage(msg);
    setMessageType(type);
    if (type !== "error") {
      setTimeout(() => {
        setMessage("");
      }, 5000);
    }
  }, []);

  const isGitRepoRef = useRef<boolean>(true);

  const fetchChanges = useCallback(async () => {
    const rootPath = getRootPath();
    if (!rootPath) {
      setChanges([]);
      showMessage("No folder selected. Open a folder to view changes.", "info");
      isGitRepoRef.current = false;
      return;
    }

    if (inFlightStatusRef.current) {
      queuedStatusRef.current = true;
      return;
    }

    inFlightStatusRef.current = true;
    setStatusLoading(true);

    try {
      const snapshot = await readGitStatusSnapshot(rootPath);
      if (snapshot.error) {
        setChanges([]);
        if (snapshot.error.includes("not a git repository")) {
          isGitRepoRef.current = false;
          showMessage("Not a git repository.", "info");
        } else {
          showMessage(snapshot.error, "info");
        }
      } else {
        isGitRepoRef.current = true;
        setChanges(snapshot.changes);
      }
    } catch (err) {
      setChanges([]);
      isGitRepoRef.current = false;
      showMessage("Failed to fetch changes: " + String(err), "error");
    } finally {
      inFlightStatusRef.current = false;
      setStatusLoading(false);
      if (queuedStatusRef.current) {
        queuedStatusRef.current = false;
        void fetchChanges();
      }
    }
  }, [getRootPath, showMessage]);

  const scheduleStatusRefresh = useCallback((delay = 180) => {
    if (statusTimerRef.current != null) {
      window.clearTimeout(statusTimerRef.current);
    }

    statusTimerRef.current = window.setTimeout(() => {
      void fetchChanges();
    }, delay);
  }, [fetchChanges]);

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
    scheduleStatusRefresh(0);
    if (logLoaded) {
      void fetchLog();
    }
  }, [fetchLog, logLoaded, scheduleStatusRefresh]);

  useEffect(() => {
    if (statusTimerRef.current != null) {
      window.clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }

    if (activeTab === "changes") {
      scheduleStatusRefresh(0);
      return;
    }

    if (activeTab === "graph" && !logLoaded) {
      setLoading(true);
      void fetchLog().finally(() => {
        setLogLoaded(true);
      });
    }
  }, [activeTab, fetchLog, logLoaded, scheduleStatusRefresh]);

  // Add event listener for window focus to refresh git status
  useEffect(() => {
    const handleFocus = () => {
      if (activeTab === "changes" && isGitRepoRef.current) {
        scheduleStatusRefresh(0);
      }
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [activeTab, scheduleStatusRefresh]);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current != null) {
        window.clearTimeout(statusTimerRef.current);
      }
    };
  }, []);

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
      // Clean up temp file - use cross-platform path
      const commitMsgPath = `${rootPath}/.pencyl_commit_msg`.replace(/\\/g, '/');
      await runShellCommand(`rm -f "${commitMsgPath}"`);
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
        refreshAll();
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
              <button className="sc-action-btn" onClick={() => scheduleStatusRefresh(0)}>
                {statusLoading ? "Refreshing..." : "Refresh"}
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

