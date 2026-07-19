import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type ModelMeta, DEFAULT_META } from "./lib/models.js";

const KNOWN_MODELS: Record<string, ModelMeta> = {
  // OpenAI
  "openai/gpt-4.1":              { reasoning: false, vision: false },
  "openai/gpt-4.1-mini":         { reasoning: false, vision: false },
  "openai/gpt-4.1-nano":         { reasoning: false, vision: false },
  "openai/gpt-4o":               { reasoning: false, vision: true  },
  "openai/gpt-4o-mini":          { reasoning: false, vision: true  },
  "openai/gpt-5-mini":           { reasoning: false, vision: false },
  "openai/gpt-5.4-mini":         { reasoning: false, vision: false },
  "openai/gpt-5.5-mini":         { reasoning: false, vision: false },
  "openai/o1":                   { reasoning: true,  vision: false },
  "openai/o1-mini":              { reasoning: true,  vision: false },
  "openai/o3":                   { reasoning: true,  vision: false },
  "openai/o3-mini":              { reasoning: true,  vision: false },
  "openai/o4-mini":              { reasoning: true,  vision: false },

  // Anthropic
  "anthropic/claude-3.5-haiku":  { reasoning: false, vision: true  },
  "anthropic/claude-3.5-sonnet": { reasoning: false, vision: true  },
  "anthropic/claude-3-opus":     { reasoning: false, vision: true  },
  "anthropic/claude-3-haiku":    { reasoning: false, vision: true  },
  "anthropic/claude-4-sonnet":   { reasoning: false, vision: true  },
  "anthropic/claude-4-haiku":    { reasoning: false, vision: true  },
  "anthropic/claude-4-opus":     { reasoning: false, vision: true  },

  // Google
  "google/gemini-2.5-flash":     { reasoning: false, vision: true  },
  "google/gemini-2.5-pro":       { reasoning: true,  vision: true  },
  "google/gemini-3.0-flash":     { reasoning: false, vision: true  },
  "google/gemini-3.5-flash":     { reasoning: false, vision: true  },

  // Meta
  "meta-llama/llama-3.1-8b-instruct":    { reasoning: false, vision: false },
  "meta-llama/llama-3.1-70b-instruct":   { reasoning: false, vision: false },
  "meta-llama/llama-3.1-405b-instruct":  { reasoning: false, vision: false },
  "meta-llama/llama-3.2-1b-instruct":    { reasoning: false, vision: false },
  "meta-llama/llama-3.2-3b-instruct":    { reasoning: false, vision: false },
  "meta-llama/llama-3.2-11b-vision-instruct": { reasoning: false, vision: true  },
  "meta-llama/llama-3.2-90b-vision-instruct": { reasoning: false, vision: true  },
  "meta-llama/llama-4-scout":            { reasoning: false, vision: true  },
  "meta-llama/llama-4-maverick":         { reasoning: false, vision: true  },

  // DeepSeek
  "deepseek/deepseek-chat":           { reasoning: false, vision: false },
  "deepseek/deepseek-r1":             { reasoning: true,  vision: false },
  "deepseek/deepseek-v3":             { reasoning: true,  vision: false },
  "deepseek/deepseek-v3.1":           { reasoning: true,  vision: false },
  "deepseek/deepseek-v4":             { reasoning: true,  vision: false },
  "deepseek/deepseek-v4-pro":         { reasoning: true,  vision: false },
  "deepseek/deepseek-v4-flash":       { reasoning: true,  vision: false },

  // Mistral
  "mistralai/mistral-large":          { reasoning: false, vision: false },
  "mistralai/mistral-small":          { reasoning: false, vision: false },
  "mistralai/mixtral-8x22b-instruct": { reasoning: false, vision: false },
  "mistralai/mistral-nemo":           { reasoning: false, vision: false },
  "mistralai/codestral":              { reasoning: false, vision: false },
  "mistralai/mistral-saba":           { reasoning: false, vision: false },

  // Qwen
  "qwen/qwen-2.5-coder-32b-instruct": { reasoning: false, vision: false },
  "qwen/qwen-2.5-72b-instruct":       { reasoning: false, vision: false },
  "qwen/qwen-3-30b":                  { reasoning: true,  vision: false },
  "qwen/qwen-3-235b":                 { reasoning: true,  vision: false },
  "qwen/qwen-3.5-397b":               { reasoning: true,  vision: false },

  // Cohere
  "cohere/command-r":                 { reasoning: false, vision: false },
  "cohere/command-r-plus":            { reasoning: false, vision: false },
  "cohere/command-r7b":               { reasoning: false, vision: false },

  // xAI
  "xai/grok-2":                       { reasoning: false, vision: true  },
  "xai/grok-2-vision":                { reasoning: false, vision: true  },
  "xai/grok-3":                       { reasoning: true,  vision: true  },
  "xai/grok-3-mini":                  { reasoning: true,  vision: false },
  "xai/grok-3-mini-fast":             { reasoning: true,  vision: false },
  "xai/grok-3-fast":                  { reasoning: true,  vision: true  },
  "xai/grok-4.1-fast-non-reasoning":  { reasoning: false, vision: false },

  // Amazon
  "amazon/nova-lite-v1":              { reasoning: false, vision: false },
  "amazon/nova-pro-v1":               { reasoning: false, vision: false },

  // Microsoft
  "microsoft/phi-3.5-mini-128k":      { reasoning: false, vision: false },
  "microsoft/phi-4":                  { reasoning: false, vision: false },

  // Other notable
  "openrouter/auto":                  { reasoning: false, vision: true  },
  "perplexity/sonar":                 { reasoning: false, vision: false },
  "perplexity/sonar-pro":             { reasoning: false, vision: false },
  "perplexity/sonar-deep-research":   { reasoning: true,  vision: false },
};

export default async function (pi: ExtensionAPI) {
  const baseUrl = "https://openrouter.ai/api/v1";

  let apiModels: Array<{ id: string; contextWindow: number; maxTokens: number }> = [];

  // Fetch models from OpenRouter API
  try {
    const resp = await fetch(`${baseUrl}/models`);
    if (resp.ok) {
      const data = (await resp.json()) as {
        data: Array<{
          id: string;
          context_length?: number;
          architecture?: {
            modality?: string;
            input_modalities?: string[];
          };
          top_provider?: {
            max_completion_tokens?: number | null;
          };
        }>;
      };
      apiModels = data.data.map((m) => {
        const maxTokens = m.top_provider?.max_completion_tokens ?? 8_192;
        return {
          id: m.id,
          contextWindow: m.context_length ?? 128_000,
          maxTokens: maxTokens > 0 ? maxTokens : 8_192,
        };
      });
    } else {
      console.error(`[openrouter] Failed to fetch models: ${resp.status}`);
    }
  } catch (err) {
    console.error(`[openrouter] Failed to fetch models:`, err);
  }

  if (apiModels.length === 0) {
    console.error("[openrouter] Could not discover any models. Check your network connection.");
    return;
  }

  const models = apiModels.map((m) => {
    const meta = KNOWN_MODELS[m.id] ?? DEFAULT_META;
    return {
      id: m.id,
      name: m.id,
      reasoning: meta.reasoning,
      input: (meta.vision ? ["text", "image"] : ["text"]) as ("text" | "image")[],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
      compat: { supportsDeveloperRole: false, supportsReasoningEffort: meta.reasoning },
      thinkingLevelMap: meta.thinkingLevelMap,
    };
  });

  pi.registerProvider("openrouter", {
    name: "OpenRouter",
    baseUrl,
    apiKey: "$OPENROUTER_API_KEY",
    api: "openai-completions",
    models,
  });
}
