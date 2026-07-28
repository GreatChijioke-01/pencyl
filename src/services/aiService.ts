import type { AIProvider } from "../store/ai_store";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export type ChatCompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionOptions = {
  provider: AIProvider;
  apiKey: string;
  messages: ChatCompletionMessage[];
  openaiModel: string;
  groqModel: string;
  anthropicModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  temperature?: number;
};

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  return text || response.statusText;
}

export async function chatCompletion(options: ChatCompletionOptions): Promise<string> {
  const {
    provider,
    apiKey,
    messages,
    openaiModel,
    groqModel,
    anthropicModel,
    ollamaBaseUrl,
    ollamaModel,
    temperature = 0.2,
  } = options;

  switch (provider) {
    case "openai":
      return callOpenAiCompatible(
        "https://api.openai.com/v1/chat/completions",
        apiKey,
        openaiModel,
        messages,
        temperature
      );
    case "groq":
      return callOpenAiCompatible(
        "https://api.groq.com/openai/v1/chat/completions",
        apiKey,
        groqModel,
        messages,
        temperature
      );
    case "anthropic":
      return callAnthropic(apiKey, anthropicModel, messages, temperature);
    case "ollama":
      return callOllama(ollamaBaseUrl, ollamaModel, messages, temperature);
    default:
      throw new Error(`Unsupported provider: ${provider satisfies never}`);
  }
}

async function callOpenAiCompatible(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: ChatCompletionMessage[],
  temperature: number
): Promise<string> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${await readError(response)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(
  apiKey: string,
  model: string,
  messages: ChatCompletionMessage[],
  temperature: number
): Promise<string> {
  const systemMessage = messages.find((message) => message.role === "system");
  const conversation = messages.filter((message) => message.role !== "system");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature,
      system: systemMessage?.content ?? "",
      messages: conversation.map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      })),
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic request failed (${response.status}): ${await readError(response)}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };

  return data.content?.map((block) => block.text ?? "").join("\n").trim() ?? "";
}

export function normalizeOllamaBaseUrl(url: string): string {
  let cleaned = (url || "").trim();
  if (!cleaned) return "http://127.0.0.1:11434";
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `http://${cleaned}`;
  }
  let prev = "";
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned.replace(/\/+(v1(\/chat\/completions)?|api(\/chat|\/generate)?|\/)?$/i, "");
  }
  return cleaned;
}

async function safeFetch(url: string, options: RequestInit): Promise<Response> {
  try {
    return await tauriFetch(url, options);
  } catch {
    return await fetch(url, options);
  }
}

export async function testOllamaConnection(baseUrl: string, model: string): Promise<{ ok: boolean; message: string }> {
  try {
    const normalizedBase = normalizeOllamaBaseUrl(baseUrl);
    const tagsRes = await safeFetch(`${normalizedBase}/api/tags`, { method: "GET" });
    if (!tagsRes.ok) {
      return { ok: false, message: `Ollama server reachable, but returned HTTP ${tagsRes.status}.` };
    }
    const data = (await tagsRes.json()) as { models?: Array<{ name?: string }> };
    const availableModels = data.models?.map((m) => m.name || "") || [];
    if (model && availableModels.length > 0) {
      const modelExists = availableModels.some(
        (m) => m === model || m.startsWith(`${model}:`) || m.split(":")[0] === model
      );
      if (!modelExists) {
        return {
          ok: false,
          message: `Connected to Ollama! However, model '${model}' was not found. Download it via 'ollama pull ${model}'.`,
        };
      }
    }
    return { ok: true, message: `Successfully connected to Ollama (${model || "server active"}).` };
  } catch (err) {
    return { ok: false, message: `Could not connect to Ollama server: ${String(err)}` };
  }
}

async function callOllama(
  baseUrl: string,
  model: string,
  messages: ChatCompletionMessage[],
  temperature: number
): Promise<string> {
  const normalizedBase = normalizeOllamaBaseUrl(baseUrl);
  const nativeEndpoint = `${normalizedBase}/api/chat`;

  const payload = {
    model,
    stream: false,
    options: {
      temperature,
    },
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  };

  let response: Response;
  try {
    response = await safeFetch(nativeEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(
      `Cannot connect to Ollama at ${normalizedBase}. Ensure 'ollama serve' is running. (${String(err)})`
    );
  }

  // If native endpoint returned 404, attempt fallback to OpenAI-compatible endpoint
  if (response.status === 404) {
    const openaiEndpoint = `${normalizedBase}/v1/chat/completions`;
    try {
      const fallbackResponse = await safeFetch(openaiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature,
          messages: messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });

      if (fallbackResponse.ok) {
        const data = (await fallbackResponse.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        return data.choices?.[0]?.message?.content ?? "";
      }
    } catch {
      // Fall through to error handling below
    }
  }

  if (!response.ok) {
    const errDetail = await readError(response);
    if (response.status === 404) {
      throw new Error(
        `Ollama request failed (404 Not Found) at ${nativeEndpoint}.\nMake sure 'ollama serve' is running and the model '${model}' is pulled (run 'ollama pull ${model}').`
      );
    }
    throw new Error(`Ollama request failed (${response.status}): ${errDetail}`);
  }

  const data = (await response.json()) as {
    message?: { content?: string };
  };

  return data.message?.content ?? "";
}

