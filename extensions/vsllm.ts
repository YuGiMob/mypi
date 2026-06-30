import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface ModelMeta {
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  vision: boolean;
  thinkingFormat?: "zai" | "deepseek" | "qwen" | "together" | "openrouter";
  api?: "openai-completions" | "anthropic-messages";
}

const KNOWN_MODELS: Record<string, ModelMeta> = {
  "deepseek-v4-flash":    { contextWindow: 1_000_000, maxTokens: 65_536, reasoning: true,  vision: false, thinkingFormat: "deepseek" },
  "deepseek-v4-pro":      { contextWindow: 1_000_000, maxTokens: 65_536, reasoning: true,  vision: false, thinkingFormat: "deepseek" },
  "deepseek-ai-v4-flash": { contextWindow: 1_000_000, maxTokens: 65_536, reasoning: true,  vision: false, thinkingFormat: "deepseek" },
  "deepseek-ai-v4-pro":   { contextWindow: 1_000_000, maxTokens: 65_536, reasoning: true,  vision: false, thinkingFormat: "deepseek" },

  "claude-sonnet-4-6":         { contextWindow: 1_000_000, maxTokens: 64_000, reasoning: true,  vision: true, thinkingFormat: "deepseek" },
  "claude-opus-4-5-20251101":  { contextWindow: 200_000, maxTokens: 64_000, reasoning: true,  vision: true, thinkingFormat: "deepseek" },
  "claude-opus-4-6":           { contextWindow: 200_000, maxTokens: 64_000, reasoning: true,  vision: true, thinkingFormat: "deepseek" },
  "claude-opus-4-7":           { contextWindow: 200_000, maxTokens: 64_000, reasoning: true,  vision: true, thinkingFormat: "deepseek" },
  "claude-opus-4-8":           { contextWindow: 200_000, maxTokens: 64_000, reasoning: true,  vision: true, thinkingFormat: "deepseek" },
  "claude-opus-4-8-free":      { contextWindow: 200_000, maxTokens: 64_000, reasoning: true,  vision: true, thinkingFormat: "deepseek" },
  "claude-haiku-4-5-20251001": { contextWindow: 200_000, maxTokens: 64_000, reasoning: false, vision: true },

  "gemini-2.5-pro":           { contextWindow: 1_048_576, maxTokens: 65_536, reasoning: true,  vision: true, thinkingFormat: "deepseek" },
  "gemini-3-flash-preview":   { contextWindow: 1_000_000, maxTokens: 8_192,  reasoning: false, vision: true },
  "gemini-3.1-pro-preview":   { contextWindow: 1_000_000, maxTokens: 65_536, reasoning: true,  vision: true, thinkingFormat: "deepseek" },
  "gemini-3.1-flash-preview": { contextWindow: 1_000_000, maxTokens: 65_536, reasoning: false, vision: true },
  "gemini-3.5-flash":         { contextWindow: 1_000_000, maxTokens: 65_536, reasoning: false, vision: true },

  "gpt-5.4":      { contextWindow: 1_000_000, maxTokens: 128_000, reasoning: true, vision: true,  thinkingFormat: "deepseek" },
  "gpt-5.4-mini": { contextWindow: 1_000_000, maxTokens: 128_000, reasoning: true, vision: true,  thinkingFormat: "deepseek" },
  "gpt-5.5":      { contextWindow: 1_000_000, maxTokens: 128_000, reasoning: true, vision: true,  thinkingFormat: "deepseek" },
  "gpt-oss-120b": { contextWindow: 128_000,   maxTokens: 8_192,   reasoning: true, vision: false, thinkingFormat: "deepseek" },

  "qwen3.6-flash": { contextWindow: 128_000, maxTokens: 16_384, reasoning: true, vision: false, thinkingFormat: "qwen" },
  "qwen3.6-plus":  { contextWindow: 128_000, maxTokens: 16_384, reasoning: true, vision: false, thinkingFormat: "qwen" },
  "qwen3.7-max":   { contextWindow: 262_144, maxTokens: 16_384, reasoning: true, vision: false, thinkingFormat: "qwen" },
  "qwen3.7-plus":  { contextWindow: 262_144, maxTokens: 16_384, reasoning: true, vision: false, thinkingFormat: "qwen" },

  "kimi-k2.6":      { contextWindow: 262_144, maxTokens: 49_152, reasoning: true, vision: true, thinkingFormat: "deepseek" },
  "kimi-k2.7-code": { contextWindow: 256_000, maxTokens: 16_384, reasoning: true, vision: true, thinkingFormat: "deepseek" },

  "glm-5.2":           { contextWindow: 976_000, maxTokens: 131_072, reasoning: true,  vision: false, thinkingFormat: "deepseek" },
  "glm-5.2-anthropic": { contextWindow: 976_000, maxTokens: 131_072, reasoning: true,  vision: false, api: "anthropic-messages" },
  "glm-5.1-free":      { contextWindow: 198_000, maxTokens: 131_072, reasoning: true,  vision: false, thinkingFormat: "deepseek" },
  "glm-4.7-flash":     { contextWindow: 198_000, maxTokens: 8_192,   reasoning: false, vision: false },
  "glm-4.6v-flash":    { contextWindow: 198_000, maxTokens: 8_192,   reasoning: false, vision: true },

  "MiniMax-M2.5": { contextWindow: 198_000, maxTokens: 8_192,  reasoning: false, vision: false },
  "MiniMax-M2.7": { contextWindow: 200_000, maxTokens: 8_192,  reasoning: true,  vision: false, thinkingFormat: "deepseek" },
  "MiniMax-M3":   { contextWindow: 512_000, maxTokens: 16_384, reasoning: true,  vision: true,  thinkingFormat: "deepseek" },

  "hunyuan-2.0-thinking-20251109": { contextWindow: 256_000, maxTokens: 16_384, reasoning: true, vision: false, thinkingFormat: "deepseek" },
  "grok-4.3":                       { contextWindow: 256_000, maxTokens: 16_384, reasoning: true, vision: false, thinkingFormat: "deepseek" },
  "doubao-seed-2-0-pro":            { contextWindow: 256_000, maxTokens: 16_384, reasoning: true, vision: false, thinkingFormat: "deepseek" },
};

const DEFAULT_META: ModelMeta = {
  contextWindow: 128_000,
  maxTokens: 16_384,
  reasoning: false,
  vision: false,
};

export default async function (pi: ExtensionAPI) {
  const baseUrl = "https://api.vsllm.com/v1";

  const apiKey = process.env.VSLLM_API_KEY;
  if (!apiKey) {
    console.error("[vsllm] VSLLM_API_KEY is not set. Get a key from https://vsllm.com, then:\n  export VSLLM_API_KEY=<your-key>");
    return;
  }

  let apiModels: Array<{ id: string; endpoints: string[] }> = [];
  try {
    const resp = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (resp.ok) {
      const data = (await resp.json()) as {
        data: Array<{ id: string; supported_endpoint_types?: string[] }>;
      };
      apiModels = data.data.map((m) => ({ id: m.id, endpoints: m.supported_endpoint_types ?? [] }));
    } else {
      console.error(`[vsllm] Failed to fetch models: ${resp.status}`);
    }
  } catch (err) {
    console.error(`[vsllm] Failed to fetch models:`, err);
  }

  if (apiModels.length === 0) {
    console.error("[vsllm] Could not discover any models. Check your network connection.");
    return;
  }

  const models = apiModels
    .filter((m) => m.endpoints.includes("openai") && !m.id.toLowerCase().includes("embedding"))
    .map((m) => {
      const meta = KNOWN_MODELS[m.id] ?? DEFAULT_META;
      const isAnthropic = meta.api === "anthropic-messages";
      return {
        id: m.id,
        name: m.id,
        reasoning: meta.reasoning,
        input: (meta.vision ? ["text", "image"] : ["text"]) as ("text" | "image")[],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: meta.contextWindow,
        maxTokens: meta.maxTokens,
        ...(meta.api ? { api: meta.api } : {}),
        compat: isAnthropic
          ? { forceAdaptiveThinking: true }
          : { ...(meta.thinkingFormat ? { thinkingFormat: meta.thinkingFormat } : {}) },
      };
    });

  const openaiModels = models.filter((m) => !m.api || m.api === "openai-completions");
  const anthropicModels = models.filter((m) => m.api === "anthropic-messages");

  if (openaiModels.length === 0 && anthropicModels.length === 0) {
    console.error("[vsllm] No chat-capable models found after filtering.");
    return;
  }

  if (openaiModels.length > 0) {
    pi.registerProvider("vsllm", {
      name: "VSLLM",
      baseUrl,
      apiKey,
      api: "openai-completions",
      compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
      },
      models: openaiModels,
    });
  }

  if (anthropicModels.length > 0) {
    pi.registerProvider("vsllm-anthropic", {
      name: "VSLLM (Anthropic)",
      baseUrl: "https://api.vsllm.com",
      apiKey,
      api: "anthropic-messages",
      compat: { forceAdaptiveThinking: true },
      models: anthropicModels.map((m) => ({ ...m, api: undefined, compat: { forceAdaptiveThinking: true } })),
    });
  }
}
