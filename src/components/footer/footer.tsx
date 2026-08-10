import { useEffect, useCallback } from "react";
import { useEditorStore } from "../../store/editorStore";
import { useAIStore } from "../../store/ai_store";
import { useFileStore } from "../../store/filestore";
import { detectLanguageFromPath, detectLineEnding } from "../../store/editorStore";
import { getCurrentGitBranch } from "../../services/fileService";
import { GitBranch, AlertTriangle, AlertCircle, Loader2, Code, FileText, Type, HardDrive, Sparkles } from "lucide-react";
import "./footer.css";

// Status Item Component - Generic wrapper for all status items
type StatusItemProps = {
  label: string;
  icon?: React.ReactNode;
  className?: string;
  onClick?: () => void;
  children?: React.ReactNode;
};

function StatusItem({ label, icon, className = "", onClick, children }: StatusItemProps) {
  return (
    <div 
      className={`status-item ${className}`}
      onClick={onClick}
      title={label}
    >
      {icon && <span className="status-icon">{icon}</span>}
      <span className="status-text">{label}</span>
      {children}
    </div>
  );
}

// Git Branch Status Component
function GitBranchStatus() {
  const branch = useEditorStore((state) => state.gitStatus.branch);
  const hasUncommittedChanges = useEditorStore((state) => state.gitStatus.hasUncommittedChanges);
  
  return (
    <StatusItem
      label={branch}
      icon={<GitBranch size={12} />}
    >
      {hasUncommittedChanges && (
        <span className="git-dot-indicator" title="Uncommitted changes"></span>
      )}
    </StatusItem>
  );
}

// Diagnostics Counter Component
function DiagnosticsCounter() {
  const errorCount = useEditorStore((state) => state.getErrorCount());
  const warningCount = useEditorStore((state) => state.getWarningCount());
  const total = errorCount + warningCount;
  
  if (total === 0) {
    return null;
  }
  
  return (
    <StatusItem
      label={`${errorCount > 0 ? errorCount + ' ' : ''}${warningCount > 0 ? warningCount + ' ' : ''}`}
      icon={
        <>
          {errorCount > 0 && <AlertCircle size={12} className="diagnostic-icon error" />}
          {errorCount === 0 && warningCount > 0 && <AlertTriangle size={12} className="diagnostic-icon warning" />}
        </>
      }
    />
  );
}

// AI Status Component with animated spinner
function AIStatusDisplay() {
  const aiState = useEditorStore((state) => state.aiStatus.state);
  const activeModel = useEditorStore((state) => state.aiStatus.activeModel);
  const getAIModel = useAIStore((state) => state.getActiveModel);
  
  // Also sync when AI store changes
  const aiStoreProvider = useAIStore((state) => state.provider);
  const aiStoreOpenAIModel = useAIStore((state) => state.openaiModel);
  const aiStoreGroqModel = useAIStore((state) => state.groqModel);
  const aiStoreAnthropicModel = useAIStore((state) => state.anthropicModel);
  const aiStoreOllamaModel = useAIStore((state) => state.ollamaModel);
  
  // Sync with AI store model
  useEffect(() => {
    const model = getAIModel();
    if (model && activeModel !== model) {
      useEditorStore.getState().setAIModel(model);
    }
  }, [getAIModel, activeModel, aiStoreProvider, aiStoreOpenAIModel, aiStoreGroqModel, aiStoreAnthropicModel, aiStoreOllamaModel]);
  
  const getStateLabel = () => {
    switch (aiState) {
      case "thinking": return "Thinking";
      case "applying": return "Applying";
      case "offline": return "Offline";
      case "idle":
      default: return activeModel ? "Idle" : "Ready";
    }
  };
  
  const showSpinner = aiState === "thinking" || aiState === "applying";
  const displayName = activeModel || getAIModel() || "AI";
  
  return (
    <StatusItem
      label={`${displayName}${aiState !== "idle" ? ` (${getStateLabel()})` : ''}`}
      icon={
        showSpinner ? (
          <Loader2 size={12} className="ai-spinner" />
        ) : (
          <Sparkles size={12} className="ai-icon" />
        )
      }
    />
  );
}

// Cursor and Selection Details Component
function CursorSelectionDetails() {
  const cursorLine = useEditorStore((state) => state.cursorPosition.line);
  const cursorColumn = useEditorStore((state) => state.cursorPosition.column);
  const selection = useEditorStore((state) => state.selection);
  
  const hasSelection = selection !== null && 
    (selection.startLine !== selection.endLine || 
     selection.startColumn !== selection.endColumn);
  
  const selectionCount = hasSelection ? selection.characterCount : 0;
  
  return (
    <StatusItem
      label={`Ln ${cursorLine}, Col ${cursorColumn}${hasSelection ? ` | ${selectionCount} selected` : ''}`}
      icon={<Code size={12} />}
    />
  );
}

// Document Formatting Info Component
function FormattingInfo() {
  const useSpaces = useEditorStore((state) => state.formatting.useSpaces);
  const tabSize = useEditorStore((state) => state.formatting.tabSize);
  
  return (
    <StatusItem
      label={useSpaces ? `Spaces: ${tabSize}` : `Tab Size: ${tabSize}`}
      icon={<FileText size={12} />}
    />
  );
}

// Text Encoding and Line Ending Component
function EncodingInfo() {
  const encoding = useEditorStore((state) => state.encoding);
  const lineEnding = useEditorStore((state) => state.lineEnding);
  
  return (
    <StatusItem
      label={`${encoding} | ${lineEnding}`}
      icon={<HardDrive size={12} />}
    />
  );
}

// Active Language Mode Component
function LanguageModeDisplay() {
  const activeLanguage = useEditorStore((state) => state.activeLanguage);
  
  return (
    <StatusItem
      label={activeLanguage}
      icon={<Type size={12} />}
    />
  );
}

// Main Footer Component
export default function Footer() {
  const activeFileId = useFileStore((state) => state.activeFileId);
  const files = useFileStore((state) => state.files);
  const activeFile = files.find((f) => f.id === activeFileId);
  const setGitBranch = useEditorStore((state) => state.setGitBranch);
  
  // Get project root path
  const projectRootPath = globalThis.__PENCYL_PROJECT_ROOT_PATH ?? null;
  
  // Fetch git branch info when project root changes
  const fetchGitBranch = useCallback(async () => {
    if (!projectRootPath) return;
    
    try {
      const branchInfo = await getCurrentGitBranch(projectRootPath);
      if (branchInfo.branch) {
        setGitBranch(branchInfo.branch, branchInfo.has_uncommitted_changes);
      }
    } catch (error) {
      console.log("Git branch detection: Not a git repository or error:", error);
      // Default to "main" if not in a git repo
      setGitBranch("main", false);
    }
  }, [projectRootPath, setGitBranch]);
  
  // Initial git branch fetch and periodic refresh
  useEffect(() => {
    fetchGitBranch();
    
    // Refresh git status every 30 seconds
    const interval = setInterval(fetchGitBranch, 30000);
    
    return () => clearInterval(interval);
  }, [fetchGitBranch]);
  
  // Update editor store when active file changes
  useEffect(() => {
    if (activeFile) {
      // Update language based on file path
      const language = detectLanguageFromPath(activeFile.path);
      useEditorStore.getState().setActiveLanguage(language);
      
      // Update line ending based on file content
      const lineEnding = detectLineEnding(activeFile.content);
      useEditorStore.getState().setLineEnding(lineEnding);
      
      // Reset cursor to start
      useEditorStore.getState().setCursorPosition(1, 1);
      useEditorStore.getState().clearSelection();
    }
  }, [activeFile]);
  
  // Sync AI model from AI store
  useEffect(() => {
    const activeModel = useAIStore.getState().getActiveModel();
    if (activeModel) {
      useEditorStore.getState().setAIModel(activeModel);
    }
  }, []);
  
  return (
    <div className="footerbar">
      <div className="footer-left">
        <GitBranchStatus />
        <DiagnosticsCounter />
        <AIStatusDisplay />
      </div>
      
      <div className="footer-center">
        <CursorSelectionDetails />
        <FormattingInfo />
        <EncodingInfo />
      </div>
      
      <div className="footer-right">
        <LanguageModeDisplay />
      </div>
    </div>
  );
}
