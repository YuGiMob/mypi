import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type ModelMeta, DEFAULT_META } from "./lib/models.js";
import { buildModels, registerProvider, type ApiModel } from "./lib/provider.js";

const KNOWN_MODELS: Record<string, ModelMeta> = {
  "gemma3:4b":         { contextWindow: 128_000, maxTokens: 8192,  reasoning: false, vision: true  },
  "gemma3:12b":        { contextWindow: 128_000, maxTokens: 8192,  reasoning: false, vision: true  },
  "gemma3:27b":        { contextWindow: 128_000, maxTokens: 8192,  reasoning: false, vision: true  },
  "gemma4:31b":        { contextWindow: 128_000, maxTokens: 8192,  reasoning: true,  vision: true,  thinkingFormat: "deepseek" },

  "qwen3-coder:480b":  { contextWindow: 256_000, maxTokens: 16384, reasoning: true,  vision: false, thinkingFormat: "qwen" },
  "qwen3-coder-next":  { contextWindow: 256_000, maxTokens: 16384, reasoning: true,  vision: false, thinkingFormat: "qwen" },
  "qwen3.5:397b":      { contextWindow: 256_000, maxTokens: 16384, reasoning: true,  vision: false, thinkingFormat: "qwen" },

  "deepseek-v3.1:671b": { contextWindow: 163_840, maxTokens: 32_768, reasoning: true,  vision: false, thinkingFormat: "deepseek", thinkingLevelMap: { minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "max" } },
  "deepseek-v3.2":      { contextWindow: 160_000, maxTokens: 32_768, reasoning: true,  vision: false, thinkingFormat: "deepseek", thinkingLevelMap: { minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "max" } },
  "deepseek-v4-pro":    { contextWindow: 1_048_576, maxTokens: 65_536, reasoning: true,  vision: false, thinkingFormat: "deepseek", thinkingLevelMap: { minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "max" } },
  "deepseek-v4-flash":  { contextWindow: 1_048_576, maxTokens: 65_536, reasoning: true,  vision: false, thinkingFormat: "deepseek", thinkingLevelMap: { minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "max" } },

  "ministral-3:3b":         { contextWindow: 256_000, maxTokens: 4096,  reasoning: false, vision: false },
  "ministral-3:8b":         { contextWindow: 256_000, maxTokens: 4096,  reasoning: false, vision: false },
  "ministral-3:14b":        { contextWindow: 256_000, maxTokens: 4096,  reasoning: false, vision: false },
  "mistral-large-3:675b":   { contextWindow: 128_000, maxTokens: 16384, reasoning: true,  vision: false, thinkingFormat: "deepseek" },

  "devstral-small-2:24b":   { contextWindow: 128_000, maxTokens: 16384, reasoning: false, vision: false },
  "devstral-2:123b":        { contextWindow: 128_000, maxTokens: 16384, reasoning: true,  vision: false, thinkingFormat: "deepseek" },

  "glm-4.7":    { contextWindow: 198_000, maxTokens: 8192,   reasoning: false, vision: false },
  "glm-5":      { contextWindow: 198_000, maxTokens: 131_072, reasoning: true,  vision: false, thinkingFormat: "deepseek" },
  "glm-5.1":    { contextWindow: 198_000, maxTokens: 131_072, reasoning: true,  vision: false, thinkingFormat: "deepseek" },
  "glm-5.2":    { contextWindow: 976_000, maxTokens: 131_072, reasoning: true,  vision: false, thinkingFormat: "deepseek" },

  "kimi-k2.5":       { contextWindow: 256_000, maxTokens: 8192,  reasoning: true,  vision: true,  thinkingFormat: "deepseek" },
  "kimi-k2.6":       { contextWindow: 256_000, maxTokens: 8192,  reasoning: true,  vision: true,  thinkingFormat: "deepseek" },
  "kimi-k2.7-code":  { contextWindow: 256_000, maxTokens: 16384, reasoning: true,  vision: true,  thinkingFormat: "deepseek" },

  "gpt-oss:20b":    { contextWindow: 128_000, maxTokens: 8192,  reasoning: true,  vision: false, thinkingFormat: "deepseek" },
  "gpt-oss:120b":   { contextWindow: 128_000, maxTokens: 8192,  reasoning: true,  vision: false, thinkingFormat: "deepseek" },

  "minimax-m2.1":    { contextWindow: 200_000, maxTokens: 8192,  reasoning: false, vision: false },
  "minimax-m2.5":    { contextWindow: 198_000, maxTokens: 8192,  reasoning: false, vision: false },
  "minimax-m2.7":    { contextWindow: 200_000, maxTokens: 8192,  reasoning: true,  vision: false, thinkingFormat: "deepseek" },
  "minimax-m3":      { contextWindow: 512_000, maxTokens: 16384, reasoning: true,  vision: true,  thinkingFormat: "deepseek" },

  "nemotron-3-nano:30b": { contextWindow: 128_000, maxTokens: 8192,  reasoning: true,  vision: false, thinkingFormat: "deepseek" },
  "nemotron-3-super":    { contextWindow: 256_000, maxTokens: 8192,  reasoning: true,  vision: false, thinkingFormat: "deepseek" },
  "nemotron-3-ultra":    { contextWindow: 256_000, maxTokens: 16384, reasoning: true,  vision: false, thinkingFormat: "deepseek" },

  "gemini-3-flash-preview": { contextWindow: 1_000_000, maxTokens: 8192, reasoning: false, vision: true },

  "rnj-1:8b": { contextWindow: 128_000, maxTokens: 8192, reasoning: false, vision: false },
};

const normalizeModelId = (id: string): string => id.replace(/:(cloud|\d{4,8})$/, "");

export default async function (pi: ExtensionAPI) {
  const baseUrl = "https://ollama.com/v1";
  const discoveryTimeoutMs = 10_000;

  let modelIds: string[] = [];
  try {
    const resp = await fetch("https://ollama.com/api/tags", { signal: AbortSignal.timeout(discoveryTimeoutMs) });
    if (resp.ok) {
      const data = (await resp.json()) as { models: Array<{ name: string }> };
      modelIds = data.models.map((m) => m.name);
    } else {
      console.error(`[ollama-cloud] Failed to fetch models: ${resp.status}`);
    }
  } catch (err) {
    console.error(`[ollama-cloud] Failed to fetch models:`, err);
  }

  if (modelIds.length === 0) {
    try {
      const resp = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(discoveryTimeoutMs) });
      if (resp.ok) {
        const data = (await resp.json()) as { data: Array<{ id: string }> };
        modelIds = data.data.map((m) => m.id);
      } else {
        console.error(`[ollama-cloud] Fallback fetch failed: ${resp.status}`);
      }
    } catch (err) {
      console.error(`[ollama-cloud] Fallback fetch failed:`, err);
    }
  }

  if (modelIds.length === 0) {
    console.error("[ollama-cloud] Could not discover any models. Check your network connection.");
    return;
  }

  const apiModels: ApiModel[] = modelIds.map((id) => {
    const meta = KNOWN_MODELS[id] ?? KNOWN_MODELS[normalizeModelId(id)] ?? DEFAULT_META;
    return {
      id,
      contextWindow: meta.contextWindow,
      maxTokens: meta.maxTokens,
    };
  });

  const models = buildModels(apiModels, KNOWN_MODELS, normalizeModelId);
  registerProvider(pi, "ollama-cloud", {
    name: "Ollama Cloud",
    baseUrl,
    apiKey: "$OLLAMA_API_KEY",
    models,
  });
}
