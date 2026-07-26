import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  FileCode2,
  Loader2,
  Send,
  Sparkles,
  Terminal,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  applyAgentFileChanges,
  buildAgentSystemPrompt,
  executeAgentCommand,
  type WorkspaceContext,
} from "../../services/agentWorkspace";
import {
  extractFileDiffs,
  extractRunCommand,
  getMessageMeta,
  isBlockedInteractiveCommand,
} from "../../services/aiAgentParser";
import { chatCompletion, type ChatCompletionMessage } from "../../services/aiService";
import { useAIStore, PROVIDER_MODEL_DEFAULTS, type AIProvider } from "../../store/ai_store";
import { useSettingsStore } from "../../store/settingsStore";
import { useDiffStore } from "../../store/diffStore";
import { useCommandStore } from "../../store/commandStore";
import { useFileStore } from "../../store/filestore";
import { isPlausibleProjectRootPath } from "../../utils/pathUtils";
import "./ai_chat.css";

type AIChatProps = {
  projectRootPath: string | null;
  onClose?: () => void;
};

type ChatRole = "user" | "ai" | "system" | "system-result";

type ChatMessage = {
  role: ChatRole;
  text: string;
  isError?: boolean;
};

const MAX_AGENT_STEPS = 4;

const SUGGESTIONS = [
  "Explain the structure of this project",
  "Refactor the active file for readability",
  "Add error handling to the current component",
];

// defining the roles that would be used in the ai chat sidebar.
function roleLabel(role: ChatRole): string {
  switch (role) {
    case "user":
      return "You";
    case "ai":
      return "Agent";
    case "system":
      return "System";
    case "system-result":
      return "Terminal";
  }
}

function RoleIcon({ role }: { role: ChatRole }) {
  if (role === "user") return <User size={12} />;
  if (role === "system-result") return <Terminal size={12} />;
  return <Bot size={12} />;
}

function toApiMessages(messages: ChatMessage[]): ChatCompletionMessage[] {
  const out: ChatCompletionMessage[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      out.push({ role: "user", content: message.text });
      continue;
    }

    if (message.role === "ai") {
      out.push({ role: "assistant", content: message.text });
      continue;
    }

    if (message.role === "system-result") {
      out.push({ role: "user", content: `Terminal output:\n${message.text}` });
      continue;
    }

    if (message.role === "system") {
      out.push({ role: "user", content: `[System] ${message.text}` });
      continue;
    }
  }

  return out;
}



export function AIChat({ projectRootPath, onClose }: AIChatProps) {
  const {
    apiKey,
    provider,
    openaiModel,
    groqModel,
    anthropicModel,
    ollamaBaseUrl,
    ollamaModel,
    setApiKey,
    setProvider,
    setOpenaiModel,
    setGroqModel,
    setAnthropicModel,
    setOllamaBaseUrl,
    setOllamaModel,
    getActiveModel,
    requiresApiKey,
  } = useAIStore();

  // Settings store - AI config
  const aiTemperature = useSettingsStore((state) => state.aiTemperature);
  const aiSystemInstructions = useSettingsStore((state) => state.aiSystemInstructions);

  // Preparing Assets for the AI model to use.
  const setPendingDiff = useDiffStore((state) => state.setPendingDiff);
  const clearAllPendingDiffs = useDiffStore((state) => state.clearAllPendingDiffs);
  const pendingCount = useDiffStore((state) => Object.keys(state.pendingDiffs).length);
  
  const setPendingCommand = useCommandStore((state) => state.setPendingCommand);
  const clearPendingCommand = useCommandStore((state) => state.clearPendingCommand);
  const pendingCommand = useCommandStore((state) => state.pendingCommand);

  const files = useFileStore((state) => state.files);
  const activeFileId = useFileStore((state) => state.activeFileId);
  const activeFile = files.find((file) => file.id === activeFileId);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [tempKey, setTempKey] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [showCommandPermission, setShowCommandPermission] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const normalizedRoot = useMemo(() => {
    if (!isPlausibleProjectRootPath(projectRootPath)) return null;
    return projectRootPath.trim();
  }, [projectRootPath]);

  const workspaceContext = useMemo<WorkspaceContext>(() => {
    const openFiles = files
      .filter((file) => file.kind === "file" && file.path)
      .map((file) => ({ path: file.path, isDirty: file.isDirty }));

    return {
      projectRoot: normalizedRoot,
      activeFilePath: activeFile?.kind === "file" ? activeFile.path : null,
      activeFileContent: activeFile?.kind === "file" ? activeFile.content : null,
      openFiles,
    };
  }, [activeFile, files, normalizedRoot]);

  const systemPrompt = useMemo(
    () => buildAgentSystemPrompt(workspaceContext, aiSystemInstructions),
    [workspaceContext, aiSystemInstructions]
  );

  const needsInitialSetup = requiresApiKey() && !apiKey;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!needsInitialSetup && !showSetup) {
      inputRef.current?.focus();
    }
  }, [needsInitialSetup, showSetup]);

  useEffect(() => {
    if (pendingCommand && !showCommandPermission) {
      setShowCommandPermission(true);
    }
  }, [pendingCommand, showCommandPermission]);

  const handleSaveSetup = () => {
    if (requiresApiKey() && !tempKey.trim() && !apiKey) return;
    if (tempKey.trim()) setApiKey(tempKey);
    setShowSetup(false);
  };

  const runAgentLoop = async (userText: string) => {
    const conversation: ChatCompletionMessage[] = [
      { role: "system", content: systemPrompt },
      ...toApiMessages(messages),
      { role: "user", content: userText },
    ];

    let aiResponse = await chatCompletion({
      provider,
      apiKey,
      messages: conversation,
      openaiModel,
      groqModel,
      anthropicModel,
      ollamaBaseUrl,
      ollamaModel,
      temperature: aiTemperature,
    });

    for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
      setMessages((prev) => [...prev, { role: "ai", text: aiResponse }]);

      const fileDiffs = extractFileDiffs(aiResponse);
      if (fileDiffs.length > 0) {
        const { applied, skipped } = await applyAgentFileChanges(
          fileDiffs,
          normalizedRoot,
          setPendingDiff
        );

        if (applied.length > 0) {
          setMessages((prev) => [
            ...prev,
            {
              role: "system",
              text: `Prepared ${applied.length} change(s) for review in the editor: ${applied.join(", ")}`,
            },
          ]);
        }

        if (skipped.length > 0) {
          setMessages((prev) => [
            ...prev,
            {
              role: "system",
              text: `Could not resolve path(s): ${skipped.join(", ")}. Open a project folder first.`,
              isError: true,
            },
          ]);
        }
      }

      const command = extractRunCommand(aiResponse);
      if (!command) break;

      if (!normalizedRoot) {
        setMessages((prev) => [
          ...prev,
          {
            role: "system-result",
            text: "Terminal command blocked: no valid project folder is open.",
            isError: true,
          },
        ]);
        break;
      }

      if (isBlockedInteractiveCommand(command)) {
        setMessages((prev) => [
          ...prev,
          {
            role: "system-result",
            text: `Terminal command blocked: interactive commands are not allowed.\n\n${command}`,
            isError: true,
          },
        ]);
        break;
      }

      // Set pending command for user approval
      setPendingCommand(command, normalizedRoot);
      break;

      aiResponse = await chatCompletion({
        provider,
        apiKey,
        messages: conversation,
        openaiModel,
        groqModel,
        anthropicModel,
        ollamaBaseUrl,
        ollamaModel,
      });
    }
  };

  const handleSendMessage = async (overrideText?: string) => {
    const userText = (overrideText ?? input).trim();
    if (!userText || isLoading) return;

    setMessages((prev) => [...prev, { role: "user", text: userText }]);
    setInput("");
    setIsLoading(true);

    try {
      await runAgentLoop(userText);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: `Error: ${String(err)}`, isError: true },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    clearAllPendingDiffs();
  };

  const handleCommandApprove = async () => {
    if (!pendingCommand) return;
    
    const { command, projectRoot } = pendingCommand;
    clearPendingCommand();
    setShowCommandPermission(false);
    setIsLoading(true);
    
    try {
      const result = await executeAgentCommand(command, projectRoot);
      setMessages((prev) => [...prev, { role: "system-result", text: result }]);
      
      // Refresh filetree after command execution to show any changes
      window.dispatchEvent(new CustomEvent("pencyl:refresh-tree"));
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "system-result", text: `Command execution error: ${String(err)}`, isError: true },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommandDeny = () => {
    if (!pendingCommand) return;
    
    const { command } = pendingCommand;
    clearPendingCommand();
    setShowCommandPermission(false);
    setMessages((prev) => [
      ...prev,
      { 
        role: "system", 
        text: `Terminal command was denied: ${command}. The agent will continue without executing it.`
      },
    ]);
  };

  const renderSetup = () => {
    const providerMeta = PROVIDER_MODEL_DEFAULTS[provider];
    const isOllama = provider === "ollama";

    return (
      <div className="ai-chat ai-chat-setup">
        <div className="ai-chat-setup-header">
          <h2>Configure AI Agent</h2>
          <p>Connect a provider to enable file edits, terminal commands, and multi-step agent runs.</p>
        </div>

        <div className="ai-chat-setup-body">
          <div className="ai-chat-field">
            <label htmlFor="ai-provider">Provider</label>
            <select
              id="ai-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as AIProvider)}
            >
              {(Object.keys(PROVIDER_MODEL_DEFAULTS) as AIProvider[]).map((value) => (
                <option key={value} value={value}>
                  {PROVIDER_MODEL_DEFAULTS[value].label}
                </option>
              ))}
            </select>
          </div>

          {!isOllama && (
            <div className="ai-chat-field">
              <label htmlFor="ai-api-key">API Key</label>
              <input
                id="ai-api-key"
                type="password"
                placeholder="Paste your API key"
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveSetup()}
              />
            </div>
          )}

          {isOllama ? (
            <>
              <div className="ai-chat-field">
                <label htmlFor="ollama-url">Ollama URL</label>
                <input
                  id="ollama-url"
                  type="text"
                  value={ollamaBaseUrl}
                  onChange={(e) => setOllamaBaseUrl(e.target.value)}
                />
              </div>
              <div className="ai-chat-field">
                <label htmlFor="ollama-model">Model</label>
                <input
                  id="ollama-model"
                  type="text"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div className="ai-chat-field">
              <label htmlFor="ai-model">{providerMeta.label} model</label>
              <input
                id="ai-model"
                type="text"
                value={
                  provider === "openai"
                    ? openaiModel
                    : provider === "groq"
                      ? groqModel
                      : anthropicModel
                }
                onChange={(e) => {
                  const value = e.target.value;
                  if (provider === "openai") setOpenaiModel(value);
                  else if (provider === "groq") setGroqModel(value);
                  else setAnthropicModel(value);
                }}
              />
            </div>
          )}

          <div className="ai-chat-provider-note">
            {isOllama
              ? "Ollama runs locally. Make sure `ollama serve` is running and the model is pulled."
              : "Your key is stored locally and sent only to the provider you select."}
          </div>
        </div>

        <div className="ai-chat-setup-footer">
          {!needsInitialSetup && (
            <button type="button" className="ai-chat-secondary-button" onClick={() => setShowSetup(false)}>
              Cancel
            </button>
          )}
          <button
            type="button"
            className="ai-chat-primary-button"
            onClick={handleSaveSetup}
            disabled={requiresApiKey() && !tempKey.trim() && !apiKey}
          >
            {needsInitialSetup ? "Continue" : "Save"}
          </button>
        </div>
      </div>
    );
  };

  if (needsInitialSetup || showSetup) {
    return renderSetup();
  }

  if (showCommandPermission && pendingCommand) {
    return (
      <div className="ai-chat">
        <div className="ai-chat-command-permission">
          <div className="ai-chat-command-permission-header">
            <Terminal size={20} />
            <h3>Terminal Command Request</h3>
          </div>
          <div className="ai-chat-command-permission-body">
            <p>The AI agent wants to run a terminal command:</p>
            <div className="ai-chat-command-display">
              <code>{pendingCommand.command}</code>
            </div>
            <p>Do you want to allow this command to execute?</p>
          </div>
          <div className="ai-chat-command-permission-actions">
            <button
              type="button"
              className="ai-chat-secondary-button"
              onClick={handleCommandDeny}
            >
              Deny
            </button>
            <button
              type="button"
              className="ai-chat-primary-button"
              onClick={handleCommandApprove}
              disabled={isLoading}
            >
              {isLoading ? "Executing..." : "Allow"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-chat">
      <header className="ai-chat-header">
        <div className="ai-chat-header-info">
          <h2 className="ai-chat-title">
            <span className="ai-chat-title-icon">
              <Sparkles size={14} />
            </span>
            AI Agent
          </h2>
          <p className="ai-chat-subtitle">
            {getActiveModel()} · {PROVIDER_MODEL_DEFAULTS[provider].label}
            {pendingCount > 0 ? ` · ${pendingCount} pending review` : ""}
            {pendingCommand ? " · Command pending approval" : ""}
            {!normalizedRoot ? " · No folder open" : ""}
          </p>
        </div>

        <div className="ai-chat-header-actions">
          <button
            type="button"
            className="ai-chat-icon-button"
            title="Clear chat"
            onClick={handleClearChat}
          >
            <Trash2 size={15} />
          </button>
          <button
            type="button"
            className="ai-chat-icon-button"
            title="Change provider or API key"
            onClick={() => {
              setTempKey(apiKey);
              setShowSetup(true);
            }}
          >
            <Bot size={15} />
          </button>
          {onClose && (
            <button type="button" className="ai-chat-icon-button" title="Close panel (Ctrl+I)" onClick={onClose}>
              <X size={15} />
            </button>
          )}
        </div>
      </header>

      <div className="ai-chat-messages">
        {messages.length === 0 && !isLoading ? (
          <div className="ai-chat-empty">
            <span className="ai-chat-empty-icon">
              <Sparkles size={22} />
            </span>
            <h3>How can I help?</h3>
            <p>The agent can edit files, run safe terminal commands, and continue automatically after command output.</p>
            <div className="ai-chat-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="ai-chat-suggestion"
                  onClick={() => void handleSendMessage(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message, index) => {
              const meta = message.role === "ai" ? getMessageMeta(message.text) : null;
              const displayText =
                message.role === "ai" ? meta?.body || "(Proposed changes below)" : message.text;

              return (
                <div
                  key={index}
                  className={`ai-chat-message ${message.role}${message.isError ? " error" : ""}`}
                >
                  <span className="ai-chat-message-label">
                    <RoleIcon role={message.role} />
                    {roleLabel(message.role)}
                  </span>

                  {displayText && <div className="ai-chat-bubble">{displayText}</div>}

                  {meta && (meta.files.length > 0 || meta.command) && (
                    <div className="ai-chat-attachments">
                      {meta.files.map((path) => (
                        <div key={path} className="ai-chat-file-card">
                          <FileCode2 size={14} />
                          <span title={path}>{path}</span>
                        </div>
                      ))}
                      {meta.command && (
                        <div className="ai-chat-command-card">
                          <Terminal size={14} />
                          <code title={meta.command}>{meta.command}</code>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {isLoading && (
              <div className="ai-chat-loading">
                <Loader2 size={14} />
                Agent is working…
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="ai-chat-composer">
        <div className="ai-chat-composer-inner">
          <textarea
            ref={inputRef}
            className="ai-chat-input"
            rows={1}
            placeholder="Ask the agent to edit files or run commands…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button
            type="button"
            className="ai-chat-send-button"
            onClick={() => void handleSendMessage()}
            disabled={isLoading || !input.trim()}
            title="Send message"
          >
            <Send size={15} />
          </button>
        </div>
        <p className="ai-chat-composer-hint">Enter to send · Shift+Enter for a new line · up to {MAX_AGENT_STEPS} agent steps per message</p>
      </div>
    </div>
  );
}

