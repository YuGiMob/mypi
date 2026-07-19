import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type ModelMeta, DEFAULT_META } from "./lib/models.js";


const KNOWN_MODELS: Record<string, ModelMeta> = {
  "agr/deepseek-v4-pro": { reasoning: true,  vision: false },
  "agr/glm-5.1":         { reasoning: true,  vision: false },

  "bbl/gemini-2.5-flash":              { reasoning: false, vision: true  },
  "bbl/gemini-2.5-flash-lite":         { reasoning: false, vision: true  },
  "bbl/gemini-3.0-flash":              { reasoning: false, vision: true  },
  "bbl/gemini-3.5-flash":              { reasoning: false, vision: true  },
  "bbl/gpt-4.1":                       { reasoning: false, vision: false },
  "bbl/gpt-5-mini":                    { reasoning: false, vision: false },
  "bbl/gpt-5.4-mini":                  { reasoning: false, vision: false },
  "bbl/gpt-5.5-mini":                  { reasoning: false, vision: false },
  "bbl/grok-4.1-fast-non-reasoning":   { reasoning: false, vision: false },

  "exa/search":      { reasoning: false, vision: false },
  "exa/search-deep": { reasoning: false, vision: false },
  "exa/search-fast": { reasoning: false, vision: false },

  "glm/glm-4.5":     { reasoning: false, vision: false },
  "glm/glm-4.5-air": { reasoning: false, vision: false },
  "glm/glm-4.6":     { reasoning: false, vision: false },
  "glm/glm-4.7":     { reasoning: false, vision: false },
  "glm/glm-5":       { reasoning: true,  vision: false },
  "glm/glm-5-turbo": { reasoning: true,  vision: false },
  "glm/glm-5.1":     { reasoning: true,  vision: false },
  "glm/glm-5.2":     { reasoning: true,  vision: false },

  "kai/kilo-auto/free":                                    { reasoning: false, vision: false },
  "kai/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": { reasoning: true,  vision: true  },
  "kai/nvidia/nemotron-3-super-120b-a12b:free":             { reasoning: true,  vision: false },
  "kai/nvidia/nemotron-3-ultra-550b-a55b:free":             { reasoning: true,  vision: false },
  "kai/nvidia/nemotron-3.5-content-safety:free":            { reasoning: false, vision: false },
  "kai/openrouter/free":                                    { reasoning: false, vision: false },
  "kai/openrouter/owl-alpha":                               { reasoning: true,  vision: false },
  "kai/poolside/laguna-m.1:free":                           { reasoning: false, vision: false },
  "kai/poolside/laguna-xs.2:free":                          { reasoning: false, vision: false },
  "kai/stepfun/step-3.7-flash:free":                        { reasoning: true,  vision: false },

  "mim/mimo-v2-omni":              { reasoning: false, vision: true  },
  "mim/mimo-v2-pro":               { reasoning: false, vision: false },
  "mim/mimo-v2-tts":               { reasoning: false, vision: false },
  "mim/mimo-v2.5":                 { reasoning: false, vision: false },
  "mim/mimo-v2.5-asr":             { reasoning: false, vision: false },
  "mim/mimo-v2.5-pro":             { reasoning: false, vision: false },
  "mim/mimo-v2.5-tts":             { reasoning: false, vision: false },
  "mim/mimo-v2.5-tts-voiceclone":  { reasoning: false, vision: false },
  "mim/mimo-v2.5-tts-voicedesign": { reasoning: false, vision: false },

  "opc/big-pickle":              { reasoning: false, vision: false },
  "opc/deepseek-v4-flash-free":  { reasoning: true,  vision: false },
  "opc/mimo-v2.5-free":          { reasoning: false, vision: false },
  "opc/minimax-m3-free":         { reasoning: true,  vision: true  },
  "opc/nemotron-3-super-free":   { reasoning: true,  vision: false },
  "opc/nemotron-3-ultra-free":   { reasoning: true,  vision: false },
  "opc/qwen3.6-plus-free":       { reasoning: true,  vision: false },

  "pplx/search": { reasoning: false, vision: false },

  "wsf/kimi-k2.6": { reasoning: true,  vision: true  },
  "wsf/swe-1.5":   { reasoning: false, vision: false },
  "wsf/swe-1.6":   { reasoning: false, vision: false },

  "xai/grok-stt": { reasoning: false, vision: false },
  "xai/grok-tts": { reasoning: false, vision: false },
};


export default async function (pi: ExtensionAPI) {
  const baseUrl = "https://api.freetheai.xyz/v1";

  const HARDCODED_MODELS: Array<{ id: string; contextWindow: number; maxTokens: number }> = [
    { id: "glm/glm-5.2", contextWindow: 976_000, maxTokens: 131_072 },
  ];

  let apiModels: Array<{ id: string; contextWindow: number; maxTokens: number }> = [];
  try {
    const resp = await fetch("https://freetheai.xyz/models.json");
    if (resp.ok) {
      const data = (await resp.json()) as {
        data: Array<{
          id: string;
          context_window?: number;
          max_output_tokens?: number;
          supports_chat?: boolean;
          supports_audio?: boolean;
        }>;
      };
      apiModels = data.data
        .filter((m) => m.supports_chat && !m.supports_audio)
        .map((m) => ({
          id: m.id,
          contextWindow: m.context_window ?? 128_000,
          maxTokens: m.max_output_tokens ?? 8_192,
        }));
    } else {
      console.error(`[freetheai] Failed to fetch models: ${resp.status}`);
    }
  } catch (err) {
    console.error(`[freetheai] Failed to fetch models:`, err);
  }

  if (apiModels.length === 0) {
    try {
      const resp = await fetch(`${baseUrl}/models`);
      if (resp.ok) {
        const data = (await resp.json()) as { data: Array<{ id: string }> };
        apiModels = data.data.map((m) => ({ id: m.id, contextWindow: 128_000, maxTokens: 8192 }));
      } else {
        console.error(`[freetheai] Fallback fetch failed: ${resp.status}`);
      }
    } catch (err) {
      console.error(`[freetheai] Fallback fetch failed:`, err);
    }
  }

  if (apiModels.length === 0) {
    console.error("[freetheai] Could not discover any models. Check your network connection.");
    return;
  }

  const seen = new Set(apiModels.map((m) => m.id));
  for (const hc of HARDCODED_MODELS) {
    if (!seen.has(hc.id)) {
      apiModels.push(hc);
      seen.add(hc.id);
    }
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

  pi.registerProvider("freetheai", {
    name: "FreeTheAI",
    baseUrl,
    apiKey: "$FREETHEAI_API_KEY",
    api: "openai-completions",
    models,
  });
}
