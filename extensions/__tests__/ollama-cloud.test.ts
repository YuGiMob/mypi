import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  Type: {},
}));

describe("ollama-cloud extension", () => {
  let pi: any;
  let originalFetch: any;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    pi = {
      registerProvider: vi.fn(),
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("discovers models from ollama.com/api/tags and registers provider", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        models: [
          { name: "gemma3:4b" },
          { name: "deepseek-v4-flash" },
          { name: "qwen3-coder:480b" },
        ],
      }),
    });

    const mod = await import("../ollama-cloud.js");
    await mod.default(pi);

    expect(pi.registerProvider).toHaveBeenCalledWith("ollama-cloud", expect.objectContaining({
      name: "Ollama Cloud",
      baseUrl: "https://ollama.com/v1",
      apiKey: "$OLLAMA_API_KEY",
    }));

    const providerConfig = pi.registerProvider.mock.calls[0]![1];
    expect(providerConfig.models).toHaveLength(3);

    const gemmaModel = providerConfig.models.find((m: any) => m.id === "gemma3:4b");
    expect(gemmaModel).toBeDefined();
    expect(gemmaModel.contextWindow).toBe(128_000);
    expect(gemmaModel.maxTokens).toBe(8192);
  });

  it("falls back to /v1/models when ollama.com/api/tags fails", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: "mistral-small:7b" }],
        }),
      });
    });

    const mod = await import("../ollama-cloud.js");
    await mod.default(pi);

    expect(pi.registerProvider).toHaveBeenCalled();
    const providerConfig = pi.registerProvider.mock.calls[0]![1];
    expect(providerConfig.models).toHaveLength(1);
    expect(providerConfig.models[0]!.id).toBe("mistral-small:7b");
  });

  it("does not register provider when no models discovered", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [] }),
    });

    const mod = await import("../ollama-cloud.js");
    await mod.default(pi);

    expect(pi.registerProvider).not.toHaveBeenCalled();
  });

  it("handles network errors gracefully", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const mod = await import("../ollama-cloud.js");
    await mod.default(pi);

    expect(pi.registerProvider).not.toHaveBeenCalled();
  });

  it("strips :cloud suffix from model IDs for metadata lookup", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        models: [
          { name: "deepseek-v4-flash:cloud" },
        ],
      }),
    });

    const mod = await import("../ollama-cloud.js");
    await mod.default(pi);

    const providerConfig = pi.registerProvider.mock.calls[0]![1];
    const model = providerConfig.models[0]!;
    expect(model.id).toBe("deepseek-v4-flash:cloud");
    expect(model.contextWindow).toBe(1_048_576);
    expect(model.maxTokens).toBe(65_536);
  });

  it("strips date-stamped snapshot suffixes from model IDs for metadata lookup", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        models: [
          { name: "deepseek-v4-flash:0731" },
        ],
      }),
    });

    const mod = await import("../ollama-cloud.js");
    await mod.default(pi);

    const providerConfig = pi.registerProvider.mock.calls[0]![1];
    const model = providerConfig.models[0]!;
    expect(model.id).toBe("deepseek-v4-flash:0731");
    expect(model.contextWindow).toBe(1_048_576);
    expect(model.maxTokens).toBe(65_536);
    expect(model.reasoning).toBe(true);
  });
});
