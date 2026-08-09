import { useState, useRef, useEffect } from "react";
import { useThemeStore, type ThemePreference, type ResolvedTheme } from "../../store/themeStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useAIStore } from "../../store/ai_store";
import { Settings, Bot, Palette, Keyboard, X, RefreshCw, Download, CheckCircle, AlertCircle } from 'lucide-react';
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import "./Preferences.css";

type PreferencesTab = "general" | "ai-config" | "appearance" | "hotkeys";

interface PreferencesProps {
  onClose: () => void;
}

const KEYBINDING_ACTIONS = [
  { action: "Save", category: "General", defaultShortcut: "Ctrl+S" },
  { action: "AI Agent", category: "AI", defaultShortcut: "Ctrl+I" },
  { action: "Terminal", category: "Terminal", defaultShortcut: "Ctrl+`" },
  { action: "Settings", category: "General", defaultShortcut: "Ctrl+," },
];

export default function Preferences({ onClose }: PreferencesProps) {
  const [activeTab, setActiveTab] = useState<PreferencesTab>("general");
  const [updateStatus, setUpdateStatus] = useState('idle');
  const [updateError, setUpdateError] = useState<string | null>(null);
  
  // Settings store
  const currentVersion = useSettingsStore((state) => state.currentVersion);
  const autoSave = useSettingsStore((state) => state.autoSave);
  const enableTerminalGuardrails = useSettingsStore((state) => state.enableTerminalGuardrails);
  const setAutoSave = useSettingsStore((state) => state.setAutoSave);
  const setEnableTerminalGuardrails = useSettingsStore((state) => state.setEnableTerminalGuardrails);
  
  // AI Config settings
  const aiSystemInstructions = useSettingsStore((state) => state.aiSystemInstructions);
  const aiTemperature = useSettingsStore((state) => state.aiTemperature);
  const aiAutoIncludeContext = useSettingsStore((state) => state.aiAutoIncludeContext);
  const aiAutoSaveBeforeExec = useSettingsStore((state) => state.aiAutoSaveBeforeExec);
  const setAiSystemInstructions = useSettingsStore((state) => state.setAiSystemInstructions);
  const setAiTemperature = useSettingsStore((state) => state.setAiTemperature);
  const setAiAutoIncludeContext = useSettingsStore((state) => state.setAiAutoIncludeContext);
  const setAiAutoSaveBeforeExec = useSettingsStore((state) => state.setAiAutoSaveBeforeExec);

  // AI Provider store (for Ollama endpoint)
  const ollamaBaseUrl = useAIStore((state) => state.ollamaBaseUrl);
  const setOllamaBaseUrl = useAIStore((state) => state.setOllamaBaseUrl);

  // Hotkeys settings
  const hotkeyBindings = useSettingsStore((state) => state.hotkeyBindings);
  const setHotkeyBinding = useSettingsStore((state) => state.setHotkeyBinding);
  const resetHotkeyBindings = useSettingsStore((state) => state.resetHotkeyBindings);

  // Theme store
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  const setResolvedTheme = useThemeStore((state) => state.setResolvedTheme);
  const [localPref, setLocalPref] = useState<ThemePreference>(preference);

  const themeOptions: Array<{
    value: ThemePreference;
    label: string;
    description: string;
    preview: ResolvedTheme | null;
  }> = [
    { value: "system", label: "System", description: "Follow the operating system theme.", preview: null },
    { value: "light", label: "Light", description: "Bright, low-contrast workspace.", preview: "light" },
    { value: "dark", label: "Dark", description: "Classic dark editor styling.", preview: "dark" },
    { value: "ocean", label: "Ocean", description: "Deep blue palette with cool accents.", preview: "ocean" },
    { value: "dracula", label: "Dracula", description: "Purple-on-charcoal theme with high contrast.", preview: "dracula" },
    { value: "sage", label: "Sage", description: "Muted forest green palette with calm, natural tones.", preview: "sage" },
    { value: "caffeine", label: "Caffeine", description: "Warm coffee tones - cream, espresso, and mocha accents.", preview: "caffeine" }
  ];

  const selectThemePref = (p: ThemePreference) => {
    setLocalPref(p);
    // Preview immediately
    const option = themeOptions.find((entry) => entry.value === p);
    if (option?.preview) {
      setResolvedTheme(option.preview);
    } else {
      // system
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      setResolvedTheme(mq.matches ? "dark" : "light");
    }
  };

  const handleSave = () => {
    setPreference(localPref);
    // All other settings are persisted automatically via Zustand persist middleware
    onClose();
  };

  const handleCheckForUpdates = async () => {
    setUpdateStatus('checking');
    setUpdateError(null);
    try {
      const update = await check();
      if (update !== null) {
        setUpdateStatus('downloading');
        await update.downloadAndInstall();
        await relaunch();
      } else {
        setUpdateStatus('latest');
      }
    } catch (error) {
      console.error("Update check failed:", error);
      const message = error instanceof Error ? error.message : String(error);
      const errorString = message.toLowerCase();
      
      // Handle specific error cases
      if (errorString.includes("fetch") || errorString.includes("network") || 
          errorString.includes("connect") || errorString.includes("econnrefused") ||
          errorString.includes("failed to fetch")) {
        setUpdateError("Unable to reach the update server. Please check your internet connection.");
      } else if (errorString.includes("404") || errorString.includes("not found")) {
        setUpdateError("Update server not configured. The latest.json file is missing from GitHub releases. Please publish a release with the update manifest to enable automatic updates.");
      } else if (errorString.includes("no signature") || errorString.includes("invalid signature") ||
                 errorString.includes("public key")) {
        setUpdateError("Update signature verification failed. The release may not be signed correctly.");
      } else if (errorString.includes("version") || errorString.includes("parse")) {
        setUpdateError("Failed to parse update information. The update manifest may be malformed.");
      } else if (message.includes("Update check failed")) {
        setUpdateError(message);
      } else {
        setUpdateError(`Update check failed: ${message}`);
      }
      setUpdateStatus('error');
    }
  };

  // Auto-check for updates when the preferences panel opens
  useEffect(() => {
    if (activeTab === "general") {
      // Small delay to avoid checking on every render
      const timer = setTimeout(() => {
        // Only auto-check if we haven't checked yet and aren't already checking
        if (updateStatus === 'idle' && !updateError) {
          handleCheckForUpdates();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  const [editingAction, setEditingAction] = useState<string | null>(null);

  const handleKeydownCapture = (e: React.KeyboardEvent, action: string) => {
    e.preventDefault();
    e.stopPropagation();

    const mod = e.ctrlKey || e.metaKey ? "Ctrl" : "";
    const key = e.key === "Control" || e.key === "Meta" || e.key === "Shift" || e.key === "Alt" ? "" : e.key;
    
    if (!mod || !key) return;

    const shortcut = key === "`" ? `${mod}+\`` : `${mod}+${key.charAt(0).toUpperCase() + key.slice(1)}`;
    setHotkeyBinding(action, shortcut);
    setEditingAction(null);
  };

  const startEditing = (action: string, _currentShortcut: string) => {
    setEditingAction(action);
  };

  const editingRef = useRef<HTMLDivElement | null>(null);


  const getUpdateButtonContent = () => {
    switch (updateStatus) {
      case 'checking':
        return <>
          <RefreshCw size={16} className="preferences-update-spinner" />
          Checking...
        </>;
      case 'downloading':
        return <>
          <Download size={16} />
          Downloading and Installing...
        </>;
      case 'latest':
        return <>
          <CheckCircle size={16} />
          Already Up-to-Date
        </>;
      case 'error':
        return <>
          <AlertCircle size={16} />
          Check Failed - Retry
        </>;
      default:
        return <>
          <RefreshCw size={16} />
          Check for Updates
        </>;
    }
  };

  const isUpdating = updateStatus === 'checking' || updateStatus === 'downloading';

  const getUpdateStatusMessage = () => {
    switch (updateStatus) {
      case 'checking':
        return <span className="preferences-update-status checking">Checking for updates...</span>;
      case 'downloading':
        return <span className="preferences-update-status downloading">Downloading update and installing...</span>;
      case 'latest':
        return <span className="preferences-update-status latest">You already have the latest version installed.</span>;
      case 'error':
        return (
          <span className="preferences-update-status error">
            {updateError || "Failed to check for updates."}
          </span>
        );
      default:
        return <span className="preferences-update-status idle">Tauri Auto-Updater is active.</span>;
    }
  };

  useEffect(() => {
    if (editingAction && editingRef.current) {
      editingRef.current.focus();
    }
  }, [editingAction]);

  return (
    <div className="preferences-container">
      {/* Header Bar */}
      <div className="preferences-header">
        <div className="preferences-header-content">
          <Settings size={20} className="preferences-icon" />
          <h2 className="preferences-title">Settings</h2>
        </div>
        <button className="preferences-close-button" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className="preferences-content">
        {/* Left Navigation Sidebar */}
        <div className="preferences-navbar">
          <nav className="preferences-nav">
            <button 
              className={`preferences-nav-item${activeTab === "general" ? " active" : ""}`}
              onClick={() => setActiveTab("general")}
            >
              <Settings size={18} className="preferences-nav-icon" />
              <span className="preferences-nav-label">General</span>
            </button>
            
            <button 
              className={`preferences-nav-item${activeTab === "ai-config" ? " active" : ""}`}
              onClick={() => setActiveTab("ai-config")}
            >
              <Bot size={18} className="preferences-nav-icon" />
              <span className="preferences-nav-label">AI Config</span>
            </button>
            
            <button 
              className={`preferences-nav-item${activeTab === "appearance" ? " active" : ""}`}
              onClick={() => setActiveTab("appearance")}
            >
              <Palette size={18} className="preferences-nav-icon" />
              <span className="preferences-nav-label">Appearance</span>
            </button>
            
            <button 
              className={`preferences-nav-item${activeTab === "hotkeys" ? " active" : ""}`}
              onClick={() => setActiveTab("hotkeys")}
            >
              <Keyboard size={18} className="preferences-nav-icon" />
              <span className="preferences-nav-label">Hotkeys</span>
            </button>
          </nav>
        </div>

        {/* Right Content Area */}
        <div className="preferences-main">
          {activeTab === "general" && (
            <div className="preferences-section">
              {/* Updates Section */}
              <div className="preferences-section-header">
                <h3>Updates</h3>
              </div>
              <div className="preferences-section-content">
                <div className="preferences-setting">
                  <div className="preferences-setting-info">
                    <span className="preferences-setting-label">Current Version</span>
                    <span className="preferences-setting-value">{currentVersion}</span>
                  </div>
                </div>
                <button 
                  className="preferences-button preferences-update-button"
                  onClick={handleCheckForUpdates}
                  disabled={isUpdating}
                >
                  {getUpdateButtonContent()}
                </button>
                <p className="preferences-setting-description">
                  {getUpdateStatusMessage()}
                </p>
              </div>

              {/* General Settings Section */}
              <div className="preferences-section-header">
                <h3>General</h3>
              </div>
              <div className="preferences-section-content">
                <div className="preferences-setting">
                  <label className="preferences-checkbox">
                    <input 
                      type="checkbox" 
                      checked={autoSave} 
                      onChange={(e) => setAutoSave(e.target.checked)}
                    />
                    <span className="preferences-checkbox-label">
                      Auto-save files on change
                    </span>
                  </label>
                </div>
                
                <div className="preferences-setting">
                  <label className="preferences-checkbox">
                    <input 
                      type="checkbox" 
                      checked={enableTerminalGuardrails} 
                      onChange={(e) => setEnableTerminalGuardrails(e.target.checked)}
                    />
                    <span className="preferences-checkbox-label">
                      Enable sandboxed terminal guardrails
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === "appearance" && (
            <div className="preferences-section">
              <div className="preferences-section-header">
                <h3>Theme</h3>
                <p className="preferences-section-subtitle">
                  Choose your theme preference. System will follow your OS setting.
                </p>
              </div>
              <div className="preferences-section-content">
                <div className="theme-options-grid">
                  {themeOptions.map((option) => (
                    <button
                      key={option.value}
                      className={`theme-option${localPref === option.value ? " active" : ""}`}
                      onClick={() => selectThemePref(option.value)}
                    >
                      <span className="theme-option-label">{option.label}</span>
                      <span className="theme-option-description">{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "ai-config" && (
            <div className="preferences-section">
              <div className="preferences-section-header">
                <h3>System Instructions</h3>
                <p className="preferences-section-subtitle">
                  Custom behavior rules appended to the AI system prompt on every request.
                </p>
              </div>
              <div className="preferences-section-content">
                <div className="preferences-setting">
                  <textarea
                    className="preferences-textarea"
                    rows={4}
                    placeholder='e.g. "Always use TypeScript strict types"'
                    value={aiSystemInstructions}
                    onChange={(e) => setAiSystemInstructions(e.target.value)}
                  />
                </div>
              </div>

              <div className="preferences-section-header">
                <h3>Temperature</h3>
                <p className="preferences-section-subtitle">
                  Controls randomness in AI responses. Lower values are more deterministic (default: 0.2).
                </p>
              </div>
              <div className="preferences-section-content">
                <div className="preferences-setting">
                  <div className="preferences-slider-row">
                    <input
                      type="range"
                      className="preferences-slider"
                      min="0"
                      max="1"
                      step="0.1"
                      value={aiTemperature}
                      onChange={(e) => setAiTemperature(parseFloat(e.target.value))}
                    />
                    <span className="preferences-slider-value">{aiTemperature.toFixed(1)}</span>
                  </div>
                  <div className="preferences-slider-labels">
                    <span>Precise (0.0)</span>
                    <span>Creative (1.0)</span>
                  </div>
                </div>
              </div>

              <div className="preferences-section-header">
                <h3>Local Inference Endpoint</h3>
                <p className="preferences-section-subtitle">
                  Override base API URL when using a local model provider (e.g., Ollama).
                </p>
              </div>
              <div className="preferences-section-content">
                <div className="preferences-setting">
                  <input
                    type="text"
                    className="preferences-text-input"
                    placeholder="http://127.0.0.1:11434"
                    value={ollamaBaseUrl}
                    onChange={(e) => setOllamaBaseUrl(e.target.value)}
                  />
                </div>
              </div>

              <div className="preferences-section-header">
                <h3>Context & Auto-Apply</h3>
              </div>
              <div className="preferences-section-content">
                <div className="preferences-setting">
                  <label className="preferences-checkbox">
                    <input 
                      type="checkbox" 
                      checked={aiAutoIncludeContext} 
                      onChange={(e) => setAiAutoIncludeContext(e.target.checked)}
                    />
                    <span className="preferences-checkbox-label">
                      Auto-include active file context in prompt
                    </span>
                  </label>
                  <p className="preferences-setting-description">
                    When enabled, the active file's content is automatically injected into the AI system prompt.
                  </p>
                </div>
                
                <div className="preferences-setting">
                  <label className="preferences-checkbox">
                    <input 
                      type="checkbox" 
                      checked={aiAutoSaveBeforeExec} 
                      onChange={(e) => setAiAutoSaveBeforeExec(e.target.checked)}
                    />
                    <span className="preferences-checkbox-label">
                      Auto-save files before AI code execution
                    </span>
                  </label>
                  <p className="preferences-setting-description">
                    When enabled, all open files are saved before the AI executes terminal commands or applies changes.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "hotkeys" && (
            <div className="preferences-section">
              <div className="preferences-section-header">
                <h3>Keyboard Shortcuts</h3>
                <p className="preferences-section-subtitle">
                  Click a shortcut to rebind it. Press the desired key combination to assign.
                </p>
              </div>
              <div className="preferences-section-content">
                <div className="preferences-hotkeys-table">
                  <div className="preferences-hotkeys-table-header">
                    <span className="preferences-hotkeys-col-action">Action / Command</span>
                    <span className="preferences-hotkeys-col-category">Category</span>
                    <span className="preferences-hotkeys-col-shortcut">Shortcut</span>
                  </div>
                  {KEYBINDING_ACTIONS.map((item) => {
                    const currentShortcut = hotkeyBindings[item.action] || item.defaultShortcut;
                    const isEditing = editingAction === item.action;
                    
                    return (
                      <div
                        key={item.action}
                        ref={isEditing ? editingRef : null}
                        className={`preferences-hotkeys-row${isEditing ? " editing" : ""}`}
                        onClick={() => !isEditing && startEditing(item.action, currentShortcut)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (isEditing) {
                            handleKeydownCapture(e, item.action);
                          }
                        }}
                      >
                        <span className="preferences-hotkeys-col-action">{item.action}</span>
                        <span className="preferences-hotkeys-col-category">
                          <span className="preferences-hotkeys-category-badge">{item.category}</span>
                        </span>
                        <span className="preferences-hotkeys-col-shortcut">
                          {isEditing ? (
                            <span className="preferences-hotkeys-listening">Press Ctrl+<span className="preferences-hotkeys-listening-hint">key</span></span>
                          ) : (
                            <kbd className="preferences-hotkeys-kbd">{currentShortcut}</kbd>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="preferences-setting" style={{ marginTop: "16px" }}>
                  <button
                    className="preferences-button preferences-button-danger"
                    onClick={resetHotkeyBindings}
                  >
                    Reset Keybindings to Default
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer with Save button */}
      <div className="preferences-footer">
        <button className="preferences-save-button" onClick={handleSave}>
          Save & Close
        </button>
      </div>
    </div>
  );
}
