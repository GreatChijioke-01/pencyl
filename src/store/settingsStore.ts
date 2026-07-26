import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import tauriConf from "../../src-tauri/tauri.conf.json";

// Default keyboard shortcuts
export const DEFAULT_KEYBINDINGS: Record<string, string> = {
  "Save": "Ctrl+S",
  "AI Agent": "Ctrl+I",
  "Terminal": "Ctrl+`",
  "Settings": "Ctrl+,",
};

interface SettingsState {
  // General settings
  autoSave: boolean;
  enableTerminalGuardrails: boolean;
  
  // AI Config settings
  aiSystemInstructions: string;
  aiTemperature: number;
  aiAutoIncludeContext: boolean;
  aiAutoSaveBeforeExec: boolean;

  // Hotkeys settings
  hotkeyBindings: Record<string, string>;

  // Version info (read-only, not persisted)
  currentVersion: string;
  
  // Actions
  setAutoSave: (enabled: boolean) => void;
  setEnableTerminalGuardrails: (enabled: boolean) => void;
  setCurrentVersion: (version: string) => void;

  // AI Config actions
  setAiSystemInstructions: (instructions: string) => void;
  setAiTemperature: (temperature: number) => void;
  setAiAutoIncludeContext: (enabled: boolean) => void;
  setAiAutoSaveBeforeExec: (enabled: boolean) => void;

  // Hotkeys actions
  setHotkeyBinding: (action: string, shortcut: string) => void;
  resetHotkeyBindings: () => void;
}

// Get app version from Tauri or tauri.conf.json/package.json
const getAppVersion = async (): Promise<string> => {
  try {
    // Try Tauri app version first
    const { invoke } = await import("@tauri-apps/api/core");
    const version = await invoke("get_app_version");
    return version as string;
  } catch (error) {
    // Fallback to tauri.conf.json version (Tauri app version) - imported at build time
    if (tauriConf.version) {
      return tauriConf.version;
    }
    // If tauriConf doesn't have version, try package.json
    try {
      const response = await fetch("/package.json");
      const packageJson = await response.json();
      return packageJson.version || "0.1.0";
    } catch {
      return "0.1.0";
    }
  }
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Default values
      autoSave: true,
      enableTerminalGuardrails: true,
      
      // AI Config defaults
      aiSystemInstructions: "",
      aiTemperature: 0.2,
      aiAutoIncludeContext: true,
      aiAutoSaveBeforeExec: true,

      // Hotkeys defaults
      hotkeyBindings: { ...DEFAULT_KEYBINDINGS },

      // Version info (not persisted)
      currentVersion: "v0.1.0",
      
      setAutoSave: (enabled) => {
        set({ autoSave: enabled });
      },
      
      setEnableTerminalGuardrails: (enabled) => {
        set({ enableTerminalGuardrails: enabled });
      },
      
      setCurrentVersion: (version) => {
        set({ currentVersion: version });
      },

      // AI Config actions
      setAiSystemInstructions: (instructions) => {
        set({ aiSystemInstructions: instructions });
      },
      setAiTemperature: (temperature) => {
        set({ aiTemperature: Math.max(0, Math.min(1, temperature)) });
      },
      setAiAutoIncludeContext: (enabled) => {
        set({ aiAutoIncludeContext: enabled });
      },
      setAiAutoSaveBeforeExec: (enabled) => {
        set({ aiAutoSaveBeforeExec: enabled });
      },

      // Hotkeys actions
      setHotkeyBinding: (action, shortcut) => {
        set((state) => ({
          hotkeyBindings: { ...state.hotkeyBindings, [action]: shortcut },
        }));
      },
      resetHotkeyBindings: () => {
        set({ hotkeyBindings: { ...DEFAULT_KEYBINDINGS } });
      },
    }),
    {
      name: "pencyl-ai-settings",
      storage: createJSONStorage(() => localStorage),
      // Only persist user configurable settings, not version info
      partialize: (state) => ({
        autoSave: state.autoSave,
        enableTerminalGuardrails: state.enableTerminalGuardrails,
        aiSystemInstructions: state.aiSystemInstructions,
        aiTemperature: state.aiTemperature,
        aiAutoIncludeContext: state.aiAutoIncludeContext,
        aiAutoSaveBeforeExec: state.aiAutoSaveBeforeExec,
        hotkeyBindings: state.hotkeyBindings,
      }),
      // Merge persisted state with defaults to ensure new fields are populated
      // even if they were not present in a previously saved store version.
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<SettingsState>),
        hotkeyBindings: {
          ...current.hotkeyBindings,
          ...(persisted as Partial<SettingsState>).hotkeyBindings,
        },
      }),
    }
  )
);

// Initialize version on startup
export const initializeSettings = async () => {
  const version = await getAppVersion();
  useSettingsStore.getState().setCurrentVersion(version);
  return version;
};