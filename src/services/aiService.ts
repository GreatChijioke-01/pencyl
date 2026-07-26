import type { AIProvider } from "../store/ai_store";

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

async function callOllama(
  baseUrl: string,
  model: string,
  messages: ChatCompletionMessage[],
  temperature: number
): Promise<string> {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/api/chat`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      options: {
        temperature,
      },
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed (${response.status}): ${await readError(response)}`);
  }

  const data = (await response.json()) as {
    message?: { content?: string };
  };

  return data.message?.content ?? "";
}
