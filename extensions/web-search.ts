import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, Static } from "typebox";

const WebSearchParams = Type.Object({
  query: Type.String({ description: "Search query" }),
  numResults: Type.Optional(Type.Number({ description: "Number of results (default: 5)", default: 5 })),
});

export type WebSearchParamsType = Static<typeof WebSearchParams>;

interface SearchResult {
  title: string;
  url: string;
  content: string;
}

interface ExaResult {
  title: string;
  url: string;
  content?: { text?: string };
}
interface ExaResponse {
  results: ExaResult[];
}

interface BraveResult {
  title: string;
  url: string;
  description?: string;
}
interface BraveResponse {
  web?: { results?: BraveResult[] };
}

interface TavilyResult {
  title: string;
  url: string;
  content?: string;
}
interface TavilyResponse {
  results?: TavilyResult[];
}

interface PerplexityResponse {
  choices?: { message?: { content?: string } }[];
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
        const results = await webSearch(query, numResults, signal);
        const formattedResults = results
          .map((r, i) => {
            const content = r.content.slice(0, 200);
            return `${i + 1}. **${r.title}**\n   ${r.url}\n   ${content}${r.content.length > 200 ? "..." : ""}`;
          })
          .join("\n\n");

        return {
          content: [{ type: "text", text: `Search results for "${query}":\n\n${formattedResults}` }],
          details: { query, numResults },
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

async function webSearch(query: string, numResults: number, signal: AbortSignal): Promise<SearchResult[]> {
  const exaKey = process.env.EXA_API_KEY;
  if (exaKey) {
    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${exaKey}`,
      },
      body: JSON.stringify({ query, numResults, contents: true }),
      signal,
    });
    if (response.ok) {
      const data = (await response.json()) as ExaResponse;
      return data.results.map((r) => ({ title: r.title, url: r.url, content: r.content?.text || "" }));
    }
  }

  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  if (braveKey) {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(numResults));
    const response = await fetch(url.toString(), {
      signal,
      headers: { "X-Subscription-Token": braveKey, "Accept": "application/json" },
    });
    if (response.ok) {
      const data = (await response.json()) as BraveResponse;
      return (data.web?.results || []).map((r) => ({ title: r.title, url: r.url, content: r.description || "" }));
    }
  }

  const tavilyKey = process.env.TAVILY_API_KEY;
  if (tavilyKey) {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: tavilyKey,
        query,
        max_results: numResults,
        include_answer: false,
        include_raw_content: false,
      }),
      signal,
    });
    if (response.ok) {
      const data = (await response.json()) as TavilyResponse;
      return (data.results || []).map((r) => ({ title: r.title, url: r.url, content: r.content || "" }));
    }
  }

  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  if (perplexityKey) {
    try {
      const response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${perplexityKey}`,
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [{
            role: "user",
            content: `Search web for: ${query}. Provide ${numResults} relevant results with titles, URLs, and brief descriptions. Format each result as: Title - URL - Description`,
          }],
        }),
        signal,
      });
      if (response.ok) {
        const data = (await response.json()) as PerplexityResponse;
        const content = data.choices?.[0]?.message?.content || "";
        const urlRegex = /https?:\/\/[^\s\)>\]]+/g;
        const lines = content.split("\n").filter(Boolean);
        return lines.slice(0, numResults).map((line, i) => {
          const urls = line.match(urlRegex) || [];
          const url = urls[0] || "(no URL available)";
          const parts = line.split(/ - /);
          const title = parts[0]?.replace(urlRegex, "").trim() || `Result ${i + 1}`;
          const desc = parts.slice(1).join(" - ").trim();
          return { title, url, content: desc || line.slice(0, 200) };
        });
      }
    } catch (err) {
      console.error("[web-search] Perplexity search failed:", err);
      throw new Error(`Perplexity search failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  throw new Error(
    "No search API configured. Set one of: EXA_API_KEY, TAVILY_API_KEY, BRAVE_SEARCH_API_KEY, or PERPLEXITY_API_KEY"
  );
}
