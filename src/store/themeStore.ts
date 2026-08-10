import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ThemePreference = "light" | "dark" | "system" | "ocean" | "dracula" | "sage" | "caffeine" | "highContrast";
export type ResolvedTheme = "light" | "dark" | "ocean" | "dracula" | "sage" | "caffeine" | "highContrast";

interface ThemeState {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  setResolvedTheme: (theme: ResolvedTheme) => void;
  applyTheme: () => void; // Utility to physically push colors to the DOM
}

export const THEME_COLORS: Record<ResolvedTheme, Record<string, string>> = {
  dark: {
    "--bg-primary": "#1e1e1e",
    "--bg-sidebar": "#121212",
    "--bg-header": "#181818",
    "--text-main": "#e0e0e0",
    "--text-muted": "#858585",
    "--accent": "#007acc",
  },
  light: {
    "--bg-primary": "#ffffff",
    "--bg-sidebar": "#f3f3f3",
    "--bg-header": "#e8e8e8",
    "--text-main": "#333333",
    "--text-muted": "#666666",
    "--accent": "#005999",
  },
  ocean: {
    "--bg-primary": "#0f172a",
    "--bg-sidebar": "#1e293b",
    "--bg-header": "#0f172a",
    "--text-main": "#e2e8f0",
    "--text-muted": "#94a3b8",
    "--accent": "#38bdf8",
  },
  dracula: {
    "--bg-primary": "#282a36",
    "--bg-sidebar": "#21222c",
    "--bg-header": "#191a21",
    "--text-main": "#f8f8f2",
    "--text-muted": "#6272a4",
    "--accent": "#bd93f9",
  },

  sage: {
    "--bg-primary": "#1e2e25",
    "--bg-sidebar": "#142019",
    "--bg-header": "#1a281f",
    "--text-main": "#e0e8d8",
    "--text-muted": "#8a9b88",
    "--accent": "#7dc498",
  },
  caffeine: {
    "--bg-primary": "#2a1e18",
    "--bg-sidebar": "#1e1410",
    "--bg-header": "#241a13",
    "--text-main": "#e8d8c0",
    "--text-muted": "#a89888",
    "--accent": "#c4a484",
  },
  highContrast: {
    "--bg-primary": "#000000",
    "--bg-sidebar": "#1a1a1a",
    "--bg-header": "#2a2a2a",
    "--text-main": "#ffffff",
    "--text-muted": "#cccccc",
    "--accent": "#ffff00",
  },
};

const getInitialResolvedTheme = (): ResolvedTheme => {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      preference: "system",
      resolvedTheme: getInitialResolvedTheme(),
      
      setPreference: (preference) => {
        const resolved = preference === "system" ? getInitialResolvedTheme() : preference;
        set({ preference, resolvedTheme: resolved });
        get().applyTheme(); // Instantly update colors on the screen
      },
      
      setResolvedTheme: (theme) => {
        set({ resolvedTheme: theme });
        get().applyTheme();
      },

      applyTheme: () => {
        if (typeof window === "undefined") return;
        
        const currentResolved = get().resolvedTheme;
        const colors = THEME_COLORS[currentResolved];
        const root = document.documentElement;

        Object.entries(colors).forEach(([variableName, value]) => {
          root.style.setProperty(variableName, value);
        });
      },
    }),
    {
      name: "pencyl-ai-theme",
      storage: createJSONStorage(() => localStorage),
    }
  )
);