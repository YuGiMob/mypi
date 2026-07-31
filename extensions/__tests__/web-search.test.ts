import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  Type: {
    Object: (props: any) => props,
    String: (opts: any) => ({ type: "string", ...opts }),
    Number: (opts: any) => ({ type: "number", ...opts }),
    Optional: (schema: any) => ({ ...schema, optional: true }),
  },
}));

vi.mock("typebox", () => ({
  Type: {
    Object: (props: any) => props,
    String: (opts: any) => ({ type: "string", ...opts }),
    Number: (opts: any) => ({ type: "number", ...opts }),
    Optional: (schema: any) => ({ ...schema, optional: true }),
  },
}));

describe("web-search extension", () => {
  let capturedTool: any;
  let pi: any;
  let originalFetch: any;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    pi = {
      registerTool: vi.fn((tool: any) => {
        capturedTool = tool;
      }),
    };

    const mod = await import("../web-search.js");
    mod.default(pi);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe("tool registration", () => {
    it("registers a tool named web_search", () => {
      expect(capturedTool).toBeDefined();
      expect(capturedTool.name).toBe("web_search");
    });

    it("has query parameter", () => {
      expect(capturedTool.parameters.query).toBeDefined();
    });

    it("has optional numResults parameter", () => {
      expect(capturedTool.parameters.numResults).toBeDefined();
    });
  });

  describe("withTimeout", () => {
    it("creates an abort signal that triggers after specified ms", async () => {
      const mod = await import("../web-search.js");

      const signal = new AbortController().signal;
      const timeoutSignal = mod.withTimeout(signal, 50);

      expect(timeoutSignal.aborted).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(timeoutSignal.aborted).toBe(true);
    });

    it("aborts when parent signal aborts", async () => {
      const mod = await import("../web-search.js");

      const parentController = new AbortController();
      const timeoutSignal = mod.withTimeout(parentController.signal, 1000);

      parentController.abort();

      expect(timeoutSignal.aborted).toBe(true);
    });
  });

  describe("search provider fallback", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("throws when no API keys are configured", async () => {
      delete process.env.EXA_API_KEY;
      delete process.env.BRAVE_SEARCH_API_KEY;
      delete process.env.TAVILY_API_KEY;

      const mod = await import("../web-search.js");

      const signal = new AbortController().signal;

      await expect(
        mod.webSearch("test query", 5, signal),
      ).rejects.toThrow("No search API configured");
    });

    it("tries Exa when its API key is set", async () => {
      process.env.EXA_API_KEY = "test-exa-key";
      delete process.env.BRAVE_SEARCH_API_KEY;
      delete process.env.TAVILY_API_KEY;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [{ title: "Result 1", url: "https://example.com", content: { text: "Content 1" } }] }),
      });

      const mod = await import("../web-search.js");

      const signal = new AbortController().signal;
      const result = await mod.webSearch("test query", 5, signal);

      expect(result.provider).toBe("Exa");
      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.title).toBe("Result 1");
    });

    it("falls back to Brave when Exa fails", async () => {
      process.env.EXA_API_KEY = "test-exa-key";
      process.env.BRAVE_SEARCH_API_KEY = "test-brave-key";
      delete process.env.TAVILY_API_KEY;

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("Exa failed"));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            web: { results: [{ title: "Brave Result", url: "https://brave.com", description: "Brave content" }] },
          }),
        });
      });

      const mod = await import("../web-search.js");

      const signal = new AbortController().signal;
      const result = await mod.webSearch("test query", 5, signal);

      expect(result.provider).toBe("Brave");
      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.title).toBe("Brave Result");
    });

    it("throws when all configured providers fail", async () => {
      process.env.EXA_API_KEY = "test-exa-key";
      process.env.BRAVE_SEARCH_API_KEY = "test-brave-key";

      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const mod = await import("../web-search.js");

      const signal = new AbortController().signal;

      await expect(
        mod.webSearch("test query", 5, signal),
      ).rejects.toThrow("All search backends failed");
    });
  });
});
