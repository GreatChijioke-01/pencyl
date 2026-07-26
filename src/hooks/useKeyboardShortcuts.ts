import { useEffect, useRef } from "react";
import { useSettingsStore } from "../store/settingsStore";

interface ShortcutHandlers {
  onSave: () => void;
  onToggleAgent: () => void;
  onToggleTerminal: () => void;
  onToggleSettings: () => void;
}

function parseShortcut(shortcut: string): { ctrl: boolean; key: string } | null {
  const parts = shortcut.split("+");
  const ctrl = parts.includes("Ctrl");
  const key = parts.filter((p) => p !== "Ctrl").join("+").toLowerCase();
  if (!key) return null;
  return { ctrl, key };
}

export function useKeyboardShortcuts({ onSave, onToggleAgent, onToggleTerminal, onToggleSettings }: ShortcutHandlers) {
  const hotkeyBindings = useSettingsStore((state) => state.hotkeyBindings);

  const onSaveRef = useRef(onSave);
  const onToggleAgentRef = useRef(onToggleAgent);
  const onToggleTerminalRef = useRef(onToggleTerminal);
  const onToggleSettingsRef = useRef(onToggleSettings);
  const bindingsRef = useRef(hotkeyBindings);

  // Keep refs up to date so the event handler always calls the latest callbacks.
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    onToggleAgentRef.current = onToggleAgent;
  }, [onToggleAgent]);

  useEffect(() => {
    onToggleTerminalRef.current = onToggleTerminal;
  }, [onToggleTerminal]);

  useEffect(() => {
    onToggleSettingsRef.current = onToggleSettings;
  }, [onToggleSettings]);

  // Keep bindings ref in sync
  useEffect(() => {
    bindingsRef.current = hotkeyBindings;
  }, [hotkeyBindings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isModifier = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const bindings = bindingsRef.current;

      for (const [action, shortcut] of Object.entries(bindings)) {
        const parsed = parseShortcut(shortcut);
        if (parsed && parsed.ctrl === isModifier && parsed.key === key) {
          e.preventDefault();
          e.stopPropagation();
          switch (action) {
            case "Save":
              onSaveRef.current?.();
              break;
            case "AI Agent":
              onToggleAgentRef.current?.();
              break;
            case "Terminal":
              onToggleTerminalRef.current?.();
              break;
            case "Settings":
              onToggleSettingsRef.current?.();
              break;
          }
          return;
        }
      }
    };

    // Capture phase: intercept before focused inputs/textareas can swallow the event.
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);
}

