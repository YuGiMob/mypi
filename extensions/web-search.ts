import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const WebSearchParams = Type.Object({
  query: Type.String({ description: "Search query" }),
  numResults: Type.Optional(Type.Number({ description: "Number of results (default: 5)", default: 5 })),
});


interface SearchResult {
  title: string;
  url: string;
  content: string;
}


export default function webSearchExtension(pi: ExtensionAPI) {

  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description: "Search the web using AI-powered search. Returns relevant results with source citations.",
    parameters: WebSearchParams,
    promptSnippet: "Search for information on the web",
    promptGuidelines: [
      "Use web_search when you need current information or facts not in the codebase",
      "Use curl in bash to fetch full page content from URLs returned by web_search",
    ],
    async execute(toolCallId, params, signal, onUpdate) {
      const { query, numResults = 5 } = params;
      onUpdate?.({ content: [{ type: "text", text: `Searching for "${query}"...` }] });

      try {
        const { results, provider } = await webSearch(query, numResults, signal);
        const formattedResults = results
          .map((r, i) => {
            const content = r.content.slice(0, 200);
            return `${i + 1}. **${r.title}**\n   ${r.url}\n   ${content}${r.content.length > 200 ? "..." : ""}`;
          })
          .join("\n\n");

        return {
          content: [{ type: "text", text: `Search results from ${provider} for "${query}":\n\n${formattedResults}` }],
          details: { query, numResults, provider },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Search error: ${error instanceof Error ? error.message : "Unknown error"}` }],
          isError: true,
        };
      }
    },
  });

}

interface SearchProvider {
  name: string;
  envVar: string;
  execute(query: string, numResults: number, signal: AbortSignal): Promise<SearchResult[]>;
}

const SEARCH_PROVIDERS: SearchProvider[] = [
  {
    name: "Exa",
    envVar: "EXA_API_KEY",
    async execute(query, numResults, signal) {
      const response = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.EXA_API_KEY}`,
        },
        body: JSON.stringify({ query, numResults, contents: false }),
        signal,
      });
      if (!response.ok) throw new Error(`${response.status}`);
      const data = (await response.json()) as {
        results: Array<{ title: string; url: string; content?: { text?: string } }>;
      };
      return data.results.map((r) => ({ title: r.title, url: r.url, content: r.content?.text || "" }));
    },
  },
  {
    name: "Brave",
    envVar: "BRAVE_SEARCH_API_KEY",
    async execute(query, numResults, signal) {
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query);
      url.searchParams.set("count", String(numResults));
      const response = await fetch(url.toString(), {
        signal,
        headers: { "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY!, "Accept": "application/json" },
      });
      if (!response.ok) throw new Error(`${response.status}`);
      const data = (await response.json()) as {
        web?: { results?: Array<{ title: string; url: string; description?: string }> };
      };
      return (data.web?.results || []).map((r) => ({ title: r.title, url: r.url, content: r.description || "" }));
    },
  },
  {
    name: "Tavily",
    envVar: "TAVILY_API_KEY",
    async execute(query, numResults, signal) {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query,
          max_results: numResults,
          include_answer: false,
          include_raw_content: false,
        }),
        signal,
      });
      if (!response.ok) throw new Error(`${response.status}`);
      const data = (await response.json()) as {
        results?: Array<{ title: string; url: string; content?: string }>;
      };
      return (data.results || []).map((r) => ({ title: r.title, url: r.url, content: r.content || "" }));
    },
  },
];

export async function webSearch(query: string, numResults: number, signal: AbortSignal): Promise<{ results: SearchResult[]; provider: string }> {
  const errors: string[] = [];

  for (const provider of SEARCH_PROVIDERS) {
    if (!process.env[provider.envVar]) continue;

    try {
      const timeoutSignal = withTimeout(signal, 15000);
      const results = await provider.execute(query, numResults, timeoutSignal);
      return { results, provider: provider.name };
    } catch (err) {
      errors.push(`${provider.name}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`All search backends failed: ${errors.join("; ")}`);
  }
  throw new Error(
    "No search API configured. Set one of: EXA_API_KEY, TAVILY_API_KEY, or BRAVE_SEARCH_API_KEY",
  );
}

export function withTimeout(signal: AbortSignal, ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  signal.addEventListener("abort", () => {
    clearTimeout(timer);
    controller.abort();
  }, { once: true });
  return controller.signal;
}
