/**
 * Ollama Cloud Provider Extension
 *
 * Registers Ollama Cloud as a provider in pi, using the OpenAI-compatible
 * endpoint at https://ollama.com/v1.
 *
 * Models are discovered dynamically from https://ollama.com/api/tags.
 *
 * Setup:
 *   1. Get an API key from https://ollama.com/settings/api-keys
 *   2. Export it:  export OLLAMA_API_KEY=your_key_here
 *   3. The extension auto-loads from ~/.pi/agent/extensions/ollama-cloud/
 *
 * Then use /model to select an ollama-cloud/* model.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Known model metadata (context windows, reasoning, vision).
// Anything not listed here gets sensible defaults.
// ---------------------------------------------------------------------------

interface ModelMeta {
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  vision: boolean;
}

const KNOWN_MODELS: Record<string, ModelMeta> = {
  // Gemma
  "gemma3:4b":         { contextWindow: 128_000, maxTokens: 8192,  reasoning: false, vision: true  },
  "gemma3:12b":        { contextWindow: 128_000, maxTokens: 8192,  reasoning: false, vision: true  },
  "gemma3:27b":        { contextWindow: 128_000, maxTokens: 8192,  reasoning: false, vision: true  },
  "gemma4:31b":        { contextWindow: 128_000, maxTokens: 8192,  reasoning: false, vision: true  },

  // Qwen
  "qwen3-coder:480b":  { contextWindow: 256_000, maxTokens: 16384, reasoning: true,  vision: false },
  "qwen3-coder-next":  { contextWindow: 256_000, maxTokens: 16384, reasoning: true,  vision: false },
  "qwen3.5:397b":      { contextWindow: 256_000, maxTokens: 16384, reasoning: true,  vision: false },

  // DeepSeek
  "deepseek-v3.1:671b": { contextWindow: 64_000, maxTokens: 8192,  reasoning: false, vision: false },
  "deepseek-v3.2":      { contextWindow: 128_000, maxTokens: 8192,  reasoning: false, vision: false },
  "deepseek-v4-pro":    { contextWindow: 128_000, maxTokens: 16384, reasoning: true,  vision: false },
  "deepseek-v4-flash":  { contextWindow: 128_000, maxTokens: 8192,  reasoning: false, vision: false },

  // Mistral / Ministral
  "ministral-3:3b":         { contextWindow: 32_000, maxTokens: 4096,  reasoning: false, vision: false },
  "ministral-3:8b":         { contextWindow: 32_000, maxTokens: 4096,  reasoning: false, vision: false },
  "ministral-3:14b":        { contextWindow: 32_000, maxTokens: 4096,  reasoning: false, vision: false },
  "mistral-large-3:675b":   { contextWindow: 128_000, maxTokens: 16384, reasoning: true,  vision: false },

  // Devstral (coding)
  "devstral-small-2:24b":   { contextWindow: 128_000, maxTokens: 16384, reasoning: false, vision: false },
  "devstral-2:123b":        { contextWindow: 128_000, maxTokens: 16384, reasoning: true,  vision: false },

  // GLM
  // GLM
  "glm-4.7":    { contextWindow: 128_000, maxTokens: 8192,   reasoning: false, vision: false },
  "glm-5":      { contextWindow: 128_000, maxTokens: 8192,   reasoning: true,  vision: false },
  "glm-5.1":    { contextWindow: 198_000, maxTokens: 131_072, reasoning: true,  vision: false },
  "glm-5.2":    { contextWindow: 976_000, maxTokens: 131_072, reasoning: true,  vision: false },

  // Kimi
  "kimi-k2.5":       { contextWindow: 128_000, maxTokens: 8192,  reasoning: true,  vision: false },
  "kimi-k2.6":       { contextWindow: 128_000, maxTokens: 8192,  reasoning: true,  vision: false },
  "kimi-k2.7-code":  { contextWindow: 128_000, maxTokens: 16384, reasoning: true,  vision: false },

  // GPT-OSS
  "gpt-oss:20b":    { contextWindow: 128_000, maxTokens: 8192,  reasoning: false, vision: false },
  "gpt-oss:120b":   { contextWindow: 128_000, maxTokens: 8192,  reasoning: true,  vision: false },

  // MiniMax
  "minimax-m2.1":    { contextWindow: 128_000, maxTokens: 8192,  reasoning: false, vision: false },
  "minimax-m2.5":    { contextWindow: 128_000, maxTokens: 8192,  reasoning: false, vision: false },
  "minimax-m2.7":    { contextWindow: 256_000, maxTokens: 8192,  reasoning: true,  vision: false },
  "minimax-m3":      { contextWindow: 256_000, maxTokens: 16384, reasoning: true,  vision: false },

  // Nemotron
  "nemotron-3-nano:30b": { contextWindow: 128_000, maxTokens: 8192,  reasoning: false, vision: false },
  "nemotron-3-super":    { contextWindow: 128_000, maxTokens: 8192,  reasoning: true,  vision: false },
  "nemotron-3-ultra":    { contextWindow: 128_000, maxTokens: 16384, reasoning: true,  vision: false },

  // Gemini
  "gemini-3-flash-preview": { contextWindow: 1_000_000, maxTokens: 8192, reasoning: false, vision: true },

  // Other
  "rnj-1:8b": { contextWindow: 128_000, maxTokens: 8192, reasoning: false, vision: false },
};

const DEFAULT_META: ModelMeta = {
  contextWindow: 128_000,
  maxTokens: 8192,
  reasoning: false,
  vision: false,
};

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default async function (pi: ExtensionAPI) {
  const baseUrl = "https://ollama.com/v1";

  // Fetch the model list from the Ollama API
  let modelIds: string[] = [];
  try {
    const resp = await fetch("https://ollama.com/api/tags");
    if (resp.ok) {
      const data = (await resp.json()) as { models: Array<{ name: string }> };
      modelIds = data.models.map((m) => m.name);
    } else {
      console.error(`[ollama-cloud] Failed to fetch models: ${resp.status}`);
    }
  } catch (err) {
    console.error(`[ollama-cloud] Failed to fetch models:`, err);
  }

  // If the tags endpoint failed, fall back to the OpenAI-compatible list
  if (modelIds.length === 0) {
    try {
      const resp = await fetch(`${baseUrl}/models`);
      if (resp.ok) {
        const data = (await resp.json()) as { data: Array<{ id: string }> };
        modelIds = data.data.map((m) => m.id);
      }
    } catch {
      // ignore
    }
  }

  if (modelIds.length === 0) {
    console.error("[ollama-cloud] Could not discover any models. Check your network connection.");
    return;
  }

  const models = modelIds.map((id) => {
    // Ollama Cloud serves models with a `:cloud` suffix (e.g. glm-5.2:cloud).
    // The KNOWN_MODELS table is keyed by the bare name, so try the full id
    // first, then strip the `:cloud` suffix for lookup.
    const bareId = id.replace(/:cloud$/, "");
    const meta = KNOWN_MODELS[id] ?? KNOWN_MODELS[bareId] ?? DEFAULT_META;
    return {
      id,
      name: id,
      reasoning: meta.reasoning,
      input: (meta.vision ? ["text", "image"] : ["text"]) as ("text" | "image")[],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: meta.contextWindow,
      maxTokens: meta.maxTokens,
      compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
      },
    };
  });

  pi.registerProvider("ollama-cloud", {
    name: "Ollama Cloud",
    baseUrl,
    apiKey: "$OLLAMA_API_KEY",
    api: "openai-completions",
    models,
  });
}
