import { describe, expect, it } from "vitest";
import { DEFAULT_META } from "../lib/models.js";

describe("DEFAULT_META", () => {
  it("has default context window of 128k", () => {
    expect(DEFAULT_META.contextWindow).toBe(128_000);
  });

  it("has default max tokens of 8192", () => {
    expect(DEFAULT_META.maxTokens).toBe(8192);
  });

  it("has reasoning disabled by default", () => {
    expect(DEFAULT_META.reasoning).toBe(false);
  });

  it("has vision disabled by default", () => {
    expect(DEFAULT_META.vision).toBe(false);
  });
});
