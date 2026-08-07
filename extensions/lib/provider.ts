import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import { type ModelMeta, DEFAULT_META } from "./models.js";

export interface ApiModel {
  id: string;
  contextWindow: number;
  maxTokens: number;
}

export interface ProviderModel {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
  compat: { supportsDeveloperRole: boolean; supportsReasoningEffort: boolean };
  thinkingLevelMap?: { [key: string]: string };
}

export function buildModels(
  apiModels: ApiModel[],
  knownModels: Record<string, ModelMeta>,
  idTransform?: (id: string) => string,
): ProviderModel[] {
  return apiModels.map((m) => {
    const lookupId = idTransform ? idTransform(m.id) : m.id;
    const meta = knownModels[lookupId] ?? DEFAULT_META;
    return {
      id: m.id,
      name: m.id,
      reasoning: meta.reasoning,
      input: (meta.vision ? ["text", "image"] : ["text"]) as ("text" | "image")[],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
      compat: { supportsDeveloperRole: meta.developerRole ?? false, supportsReasoningEffort: meta.reasoning },
      thinkingLevelMap: meta.thinkingLevelMap,
    };
  });
}

export function registerProvider(
  pi: ExtensionAPI,
  key: string,
  config: {
    name: string;
    baseUrl: string;
    apiKey: string;
    models: ProviderModel[];
    refreshModels?: ProviderConfig["refreshModels"];
  },
) {
  pi.registerProvider(key, {
    name: config.name,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    api: "openai-completions",
    models: config.models,
    ...(config.refreshModels ? { refreshModels: config.refreshModels } : {}),
  });
}
