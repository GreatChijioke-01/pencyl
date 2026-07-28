import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type AIProvider = "openai" | "anthropic" | "groq" | "ollama";

export const PROVIDER_MODEL_DEFAULTS: Record<
  AIProvider,
  { label: string; modelKey: keyof Pick<AIState, "openaiModel" | "groqModel" | "anthropicModel" | "ollamaModel">; defaultModel: string }
> = {
  openai: { label: "OpenAI", modelKey: "openaiModel", defaultModel: "gpt-4o-mini" },
  anthropic: { label: "Anthropic", modelKey: "anthropicModel", defaultModel: "claude-3-5-haiku-latest" },
  groq: { label: "Groq", modelKey: "groqModel", defaultModel: "llama-3.1-8b-instant" },
  ollama: { label: "Ollama", modelKey: "ollamaModel", defaultModel: "llama3.2" },
};

interface AIState {
  apiKey: string;
  provider: AIProvider;
  openaiModel: string;
  groqModel: string;
  anthropicModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  setApiKey: (key: string) => void;
  setProvider: (provider: AIProvider) => void;
  setOpenaiModel: (model: string) => void;
  setGroqModel: (model: string) => void;
  setAnthropicModel: (model: string) => void;
  setOllamaBaseUrl: (url: string) => void;
  setOllamaModel: (model: string) => void;
  getActiveModel: () => string;
  requiresApiKey: () => boolean;
  clearConfig: () => void;
}

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      apiKey: "",
      provider: "openai",
      openaiModel: PROVIDER_MODEL_DEFAULTS.openai.defaultModel,
      groqModel: PROVIDER_MODEL_DEFAULTS.groq.defaultModel,
      anthropicModel: PROVIDER_MODEL_DEFAULTS.anthropic.defaultModel,
      ollamaBaseUrl: "http://127.0.0.1:11434",
      ollamaModel: PROVIDER_MODEL_DEFAULTS.ollama.defaultModel,

      setApiKey: (key) => set({ apiKey: key.trim() }),
      setProvider: (provider) => set({ provider }),
      setOpenaiModel: (model) => set({ openaiModel: model.trim() }),
      setGroqModel: (model) => set({ groqModel: model.trim() }),
      setAnthropicModel: (model) => set({ anthropicModel: model.trim() }),
      setOllamaBaseUrl: (url) => set({ ollamaBaseUrl: url.trim() }),
      setOllamaModel: (model) => set({ ollamaModel: model.trim() }),

      getActiveModel: () => {
        const state = get();
        switch (state.provider) {
          case "openai":
            return state.openaiModel;
          case "groq":
            return state.groqModel;
          case "anthropic":
            return state.anthropicModel;
          case "ollama":
            return state.ollamaModel;
          default:
            return PROVIDER_MODEL_DEFAULTS.openai.defaultModel;
        }
      },

      requiresApiKey: () => get().provider !== "ollama",

      clearConfig: () =>
        set({
          apiKey: "",
          provider: "openai",
        }),
    }),
    {
      name: "pencyl-ai-config",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
