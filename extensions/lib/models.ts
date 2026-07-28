export interface ModelMeta {
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  vision: boolean;
  thinkingFormat?: string;
  thinkingLevelMap?: { [key: string]: string };
  developerRole?: boolean;
}

export const DEFAULT_META: ModelMeta = {
  contextWindow: 128_000,
  maxTokens: 8192,
  reasoning: false,
  vision: false,
};
