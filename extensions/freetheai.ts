/**
 * FreeTheAI Provider Extension
 *
 * Registers FreeTheAI as a provider in pi, using the OpenAI-compatible
 * endpoint at https://api.freetheai.xyz/v1.
 *
 * Models are discovered dynamically from https://freetheai.xyz/models.json,
 * which provides per-model context_window and max_output_tokens.
 * A KNOWN_MODELS table supplies reasoning and vision flags for known models.
 *
 * Setup:
 *   1. Get an API key from https://discord.gg/secrets (use /signup then /checkin)
 *   2. Export it:  export FREETHEAI_API_KEY=your_key_here
 *   3. The extension auto-loads from ~/.pi/agent/extensions/freetheai.ts
 *
 * Then use /model to select a freetheai/* model.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Known model metadata (reasoning, vision).
// contextWindow and maxTokens come from the API response.
// Anything not listed here gets sensible defaults.
// ---------------------------------------------------------------------------

interface ModelMeta {
  reasoning: boolean;
  vision: boolean;
}

const KNOWN_MODELS: Record<string, ModelMeta> = {
  // --- agr/* (role_gated) ---
  "agr/deepseek-v4-pro": { reasoning: true,  vision: false },
  "agr/glm-5.1":         { reasoning: true,  vision: false },

  // --- bbl/* (site_catalog) ---
  "bbl/gemini-2.5-flash":              { reasoning: false, vision: true  },
  "bbl/gemini-2.5-flash-lite":         { reasoning: false, vision: true  },
  "bbl/gemini-3.0-flash":              { reasoning: false, vision: true  },
  "bbl/gemini-3.5-flash":              { reasoning: false, vision: true  },
  "bbl/gpt-4.1":                       { reasoning: false, vision: false },
  "bbl/gpt-5-mini":                    { reasoning: false, vision: false },
  "bbl/gpt-5.4-mini":                  { reasoning: false, vision: false },
  "bbl/gpt-5.5-mini":                  { reasoning: false, vision: false },
  "bbl/grok-4.1-fast-non-reasoning":   { reasoning: false, vision: false },

  // --- exa/* (role_gated, search tools) ---
  "exa/search":      { reasoning: false, vision: false },
  "exa/search-deep": { reasoning: false, vision: false },
  "exa/search-fast": { reasoning: false, vision: false },

  // --- glm/* (site_catalog) ---
  "glm/glm-4.5":     { reasoning: false, vision: false },
  "glm/glm-4.5-air": { reasoning: false, vision: false },
  "glm/glm-4.6":     { reasoning: false, vision: false },
  "glm/glm-4.7":     { reasoning: false, vision: false },
  "glm/glm-5":       { reasoning: true,  vision: false },
  "glm/glm-5-turbo": { reasoning: true,  vision: false },
  "glm/glm-5.1":     { reasoning: true,  vision: false },
  "glm/glm-5.2":     { reasoning: true,  vision: false },

  // --- kai/* (site_catalog) ---
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

  // --- mim/* (role_gated) ---
  "mim/mimo-v2-omni":              { reasoning: false, vision: true  },
  "mim/mimo-v2-pro":               { reasoning: false, vision: false },
  "mim/mimo-v2-tts":               { reasoning: false, vision: false },
  "mim/mimo-v2.5":                 { reasoning: false, vision: false },
  "mim/mimo-v2.5-asr":             { reasoning: false, vision: false },
  "mim/mimo-v2.5-pro":             { reasoning: false, vision: false },
  "mim/mimo-v2.5-tts":             { reasoning: false, vision: false },
  "mim/mimo-v2.5-tts-voiceclone":  { reasoning: false, vision: false },
  "mim/mimo-v2.5-tts-voicedesign": { reasoning: false, vision: false },

  // --- opc/* (site_catalog) ---
  "opc/big-pickle":              { reasoning: false, vision: false },
  "opc/deepseek-v4-flash-free":  { reasoning: true,  vision: false },
  "opc/mimo-v2.5-free":          { reasoning: false, vision: false },
  "opc/minimax-m3-free":         { reasoning: true,  vision: true  },
  "opc/nemotron-3-super-free":   { reasoning: true,  vision: false },
  "opc/nemotron-3-ultra-free":   { reasoning: true,  vision: false },
  "opc/qwen3.6-plus-free":       { reasoning: true,  vision: false },

  // --- pplx/* (role_gated, search tool) ---
  "pplx/search": { reasoning: false, vision: false },

  // --- wsf/* (site_catalog) ---
  "wsf/kimi-k2.6": { reasoning: true,  vision: true  },
  "wsf/swe-1.5":   { reasoning: false, vision: false },
  "wsf/swe-1.6":   { reasoning: false, vision: false },

  // --- xai/* (role_gated, speech) ---
  "xai/grok-stt": { reasoning: false, vision: false },
  "xai/grok-tts": { reasoning: false, vision: false },
};

const DEFAULT_META: ModelMeta = {
  reasoning: false,
  vision: false,
};

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default async function (pi: ExtensionAPI) {
  const baseUrl = "https://api.freetheai.xyz/v1";

  // Fetch the model list from the FreeTheAI models.json (includes context_window, max_output_tokens)
  // Hardcoded models not yet in the API catalog but known to be available
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
          context_window: number;
          max_output_tokens: number;
        }>;
      };
      apiModels = data.data.map((m) => ({
        id: m.id,
        contextWindow: m.context_window,
        maxTokens: m.max_output_tokens,
      }));
    } else {
      console.error(`[freetheai] Failed to fetch models: ${resp.status}`);
    }
  } catch (err) {
    console.error(`[freetheai] Failed to fetch models:`, err);
  }

  // Fall back to the OpenAI-compatible /v1/models endpoint (no context/token info)
  if (apiModels.length === 0) {
    try {
      const resp = await fetch(`${baseUrl}/models`);
      if (resp.ok) {
        const data = (await resp.json()) as { data: Array<{ id: string }> };
        apiModels = data.data.map((m) => ({
          id: m.id,
          contextWindow: 128_000,
          maxTokens: 8192,
        }));
      }
    } catch {
      // ignore
    }
  }

  if (apiModels.length === 0) {
    console.error("[freetheai] Could not discover any models. Check your network connection.");
    return;
  }
  // Merge API-discovered models with hardcoded models (avoiding duplicates)
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
      compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
      },
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
