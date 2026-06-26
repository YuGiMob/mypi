/**
 * Web Search Extension
 *
 * A focused web search extension that provides web search
 * without unused tools. Uses web search APIs to find information.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, Static } from "typebox";

// Define schemas for tool parameters
const WebSearchParams = Type.Object({
	query: Type.String({ description: "Search query" }),
	numResults: Type.Optional(Type.Number({ description: "Number of results (default: 5)", default: 5 })),
});

// const FetchContentParams = Type.Object({
// 	url: Type.String({ description: "URL to fetch content from" }),
// 	prompt: Type.Optional(Type.String({ description: "Question or instruction for content extraction (appended as reference context)" })),
// });

// Type for tool outputs
export type WebSearchParamsType = Static<typeof WebSearchParams>;
// export type FetchContentParamsType = Static<typeof FetchContentParams>;

export default function webSearchExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.notify("Web search extension loaded", "info");
	});

	// Register a focused web_search tool
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description: "Search the web using AI-powered search. Returns relevant results with source citations.",
		parameters: WebSearchParams,
		promptSnippet: "Search for information on the web",
		promptGuidelines: [
			"Use web_search when you need current information or facts not in the codebase",
			"Use curl in bash to fetch full page content from URLs returned by web_search"
		],
		async execute(toolCallId, params, signal, onUpdate) {
			const { query, numResults = 5 } = params;

			onUpdate?.({ content: [{ type: "text", text: `Searching for "${query}"...` }] });

			try {
				// Use the web_search function
				const results = await webSearch(query, numResults, signal);

				// Format results as readable content
				const formattedResults = results
					.map((r: { title: string; url: string; content: string }, i: number) => {
						const content = r.content.slice(0, 200);
						return `${i + 1}. **${r.title}**\n   ${r.url}\n   ${content}${r.content.length > 200 ? "..." : ""}`;
					})
					.join("\n\n");

				return {
					content: [
						{
							type: "text",
							text: `Search results for "${query}":\n\n${formattedResults}`,
						},
					],
					details: { query, numResults },
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Search error: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
					isError: true,
				};
			}
		},
	});

// 	// Register fetch_content tool for getting full page content
// 	pi.registerTool({
// 		name: "fetch_content",
// 		label: "Fetch Content",
// 		description: "Fetch and extract readable text from a URL. The prompt parameter is included as reference context at the end.",
// 		parameters: FetchContentParams,
// 		promptSnippet: "Extract content from a URL",
// 		async execute(toolCallId, params, signal, onUpdate) {
// 			const { url, prompt } = params;

// 			onUpdate?.({ content: [{ type: "text", text: `Fetching ${url}...` }] });

// 			try {
// 				const response = await fetch(url, {
// 					headers: {
// 						"User-Agent": "pi-coding-agent/1.0",
// 					},
// 					// Add timeout (30 seconds)
// 					signal: AbortSignal.timeout(30000),
// 				});

// 				if (!response.ok) {
// 					return {
// 						content: [
// 							{
// 								type: "text",
// 								text: `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
// 							},
// 						],
// 						isError: true,
// 					};
// 				}

// 				const text = await response.text();

// 				// Extract and clean HTML content (no limit)
// 				const extracted = extractReadableContent(text);

// 				// Show URL at the end of the content with optional prompt context
// 				const footer = prompt
// 					? `\n\n[Source: ${url}] Query: ${prompt}`
// 					: `\n\n[Source: ${url}]`;

// 				return {
// 					content: [
// 						{
// 							type: "text",
// 							text: extracted + footer,
// 						},
// 					],
// 					details: { url, length: extracted.length },
// 				};
// 			} catch (error) {
// 				return {
// 					content: [
// 						{
// 							type: "text",
// 							text: `Fetch error: ${error instanceof Error ? error.message : "Unknown error"}`,
// 						},
// 					],
// 					isError: true,
// 				};
// 			}
// 		},
// 	});

	// Register a command to configure the extension
	pi.registerCommand("websearch", {
		description: "Web search settings: /websearch <config>",
		handler: async (args, ctx) => {
			if (!args) {
				ctx.ui.notify("Web search extension active. Tool: web_search", "info");
				return;
			}

			const parts = args.split(" ").filter(Boolean);
			const action = parts[0];

			if (action === "reset") {
				ctx.ui.notify("Web search reset", "info");
			} else {
				ctx.ui.notify(`Unknown action: ${action}`, "warning");
			}
		},
	});
}

/**
 * Web Search Helper Function
 *
 * Configurable to use Exa, Brave, Tavily, or Perplexity search APIs.
 * Set one of the following environment variables:
 * - EXA_API_KEY for Exa search (https://exa.ai) - recommended for code/technical
 * - TAVILY_API_KEY for Tavily (https://tavily.com/)
 * - BRAVE_SEARCH_API_KEY for Brave Search (https://brave.com/search/api/)
 * - PERPLEXITY_API_KEY for Perplexity (https://perplexity.ai)
 *
 * Providers are tried in order of recommendation. First available key is used.
 */
async function webSearch(
	query: string,
	numResults: number,
	signal: AbortSignal
): Promise<Array<{ title: string; url: string; content: string }>> {
	// Try Exa first (recommended for code/technical searches)
	const exaKey = process.env.EXA_API_KEY;
	if (exaKey) {
		const response = await fetch("https://api.exa.ai/search", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${exaKey}`,
			},
			body: JSON.stringify({
				query,
				numResults,
				contents: true,
			}),
			signal,
		});

		if (response.ok) {
			const data = await response.json();
			return data.results.map((r: any) => ({
				title: r.title,
				url: r.url,
				content: r.content?.text || "",
			}));
		}
	}

	// Try Brave Search
	const braveKey = process.env.BRAVE_SEARCH_API_KEY;
	if (braveKey) {
		const url = new URL("https://api.search.brave.com/res/v1/web/search");
		url.searchParams.set("q", query);
		url.searchParams.set("count", String(numResults));

		const response = await fetch(url.toString(), {
			signal,
			headers: {
				"X-Subscription-Token": braveKey,
				"Accept": "application/json",
			},
		});

		if (response.ok) {
			const data = await response.json();
			return (data.web?.results || []).map((r: any) => ({
				title: r.title,
				url: r.url,
				content: r.description || "",
			}));
		}
	}

	// Try Tavily
	const tavilyKey = process.env.TAVILY_API_KEY;
	if (tavilyKey) {
		const response = await fetch("https://api.tavily.com/search", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
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
			const data = await response.json();
			return (data.results || []).map((r: any) => ({
				title: r.title,
				url: r.url,
				content: r.content || "",
			}));
		}
	}

	// Try Perplexity (optional, less common)
	// Note: Perplexity doesn't provide structured URLs in all cases
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
					messages: [
						{
							role: "user",
							content: `Search web for: ${query}. Provide ${numResults} relevant results with titles, URLs, and brief descriptions. Format each result as: Title - URL - Description`,
						},
					],
				}),
				signal,
			});

			if (response.ok) {
				const data = await response.json();
				const content = data.choices?.[0]?.message?.content || "";
				// Perplexity returns formatted text - try to extract structured results
				const urlRegex = /https?:\/\/[^\s\)>\]]+/g;
				const lines = content.split("\n").filter(Boolean);

				return lines.slice(0, numResults).map((line: string, i: number) => {
					const urls = line.match(urlRegex) || [];
					const url = urls[0] || "(no URL available)";
					// Try to parse "Title - URL - Description" format
					const parts = line.split(/ - /);
					const title = parts[0]?.replace(urlRegex, "").trim() || `Result ${i + 1}`;
					const desc = parts.slice(1).join(" - ").trim();
					return {
						title,
						url,
						content: desc || line.slice(0, 200),
					};
				});
			}
		} catch {
			// Perplexity failed, continue to next provider
		}
	}

	// No search provider configured
	throw new Error(
		"No search API configured. Set one of: EXA_API_KEY, TAVILY_API_KEY, BRAVE_SEARCH_API_KEY, or PERPLEXITY_API_KEY"
	);
}

/**
 * HTML Entity decoding map
 */
// const HTML_ENTITIES: Record<string, string> = {
// 	nbsp: " ",
// 	space: " ",
// 	tab: "\t",
// 	newLine: "\n",
// 	cr: "\r",
// 	amp: "&",
// 	lt: "<",
// 	gt: ">",
// 	quot: '"',
// 	apos: "'",
// 	ndash: "\u2013",
// 	mdash: "\u2014",
// 	hellip: "\u2026",
// 	bull: "\u2022",
// 	lsquo: "\u2018",
// 	rsquo: "\u2019",
// 	ldquo: "\u201C",
// 	rdquo: "\u201D",
// 	laquo: "\u00AB",
// 	raquo: "\u00BB",
// 	copy: "\u00A9",
// 	reg: "\u00AE",
// 	trade: "\u2122",
// 	euro: "\u20AC",
// 	pound: "\u00A3",
// 	yen: "\u00A5",
// 	cent: "\u00A2",
// 	deg: "\u00B0",
// 	micro: "\u00B5",
// 	para: "\u00B6",
// 	sect: "\u00A7",
// 	abull: "\u2022",
// 	star: "*",
// 	dagger: "\u2020",
// 	ddagger: "\u2021",
// 	permil: "\u2030",
// 	lsaquo: "\u2039",
// 	rsaquo: "\u203A",
// 	scaron: "\u0161",
// 	Scaron: "\u0160",
// 	zcaron: "\u017E",
// 	Zcaron: "\u017D",
// 	yuml: "\u00FF",
// 	Yuml: "\u0178",
// 	nl: "\n",
// 	return: "\r",
// 	shift: "\t",
// 	excl: "!"
// };

// /**
//  * Decode HTML entities in text
//  */
// function decodeHtmlEntities(text: string): string {
// 	// Decode numeric entities (&#123; or &#x1F4A9;)
// 	let result = text.replace(/&#(\d+);/g, (_, code) =>
// 		String.fromCharCode(parseInt(code, 10))
// 	);
// 	result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
// 		String.fromCharCode(parseInt(hex, 16))
// 	);

// 	// Decode named entities
// 	result = result.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (match, name) => {
// 		const lower = name.toLowerCase();
// 		if (HTML_ENTITIES[lower]) {
// 			return HTML_ENTITIES[lower];
// 		}
// 		// Unknown entity - return as-is
// 		return match;
// 	});

// 	return result;
// }

// /**
//  * Extract readable content from HTML text
//  * Uses heuristics to identify main content vs navigation/sidebars
//  */
// function extractReadableContent(html: string): string {
// 	// Step 1: Remove unwanted elements
// 	let text = html
// 		// Remove scripts and styles completely
// 		.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
// 		.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
// 		// Remove comments
// 		.replace(/<!--[\s\S]*?-->/g, "")
// 		// Remove noscript content
// 		.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
// 		// Remove iframe content
// 		.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "")
// 		// Remove SVG
// 		.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "")
// 		// Remove common non-content elements
// 		.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "\n")
// 		.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "\n")
// 		.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "\n")
// 		.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "\n")
// 		.replace(/<form[^>]*>[\s\S]*?<\/form>/gi, "")
;

// 	// Step 2: Try to extract main content area
// 	// Look for article, main, or content divs
// 	const mainContentMatch = text.match(
// 		/<(?:article|main|main\s[^>]*|content|div(?:\s[^>]*)?(?:id|class)=["'][^"']*(?:content|article|main|body|post|entry|text|story)[^"']*['"])[^>]*>([\s\S]*?)<\/(?:article|main|div)>/i
// 	);
// 	if (mainContentMatch && mainContentMatch[1].length > 200) {
// 		text = mainContentMatch[1];
// 	}

// 	// Step 3: Replace block-level elements with newlines for readability
// 	text = text
// 		.replace(/<(?:p|div|br|li|tr|h[1-6]|section|article|blockquote|hr)[^>]*>/gi, "\n")
// 		.replace(/<\/(?:p|div|li|tr|h[1-6]|section|article|blockquote)>/gi, "\n");

// 	// Step 4: Replace common separators with newlines
// 	text = text.replace(/<hr\s*\/?>/gi, "\n---\n");

// 	// Step 5: Remove remaining HTML tags
// 	text = text.replace(/<[^>]+>/g, "");

// 	// Step 6: Decode HTML entities
// 	text = decodeHtmlEntities(text);

// 	// Step 7: Clean up whitespace
// 	text = text
// 		.replace(/[\r\n]+/g, "\n") // Multiple newlines to one
// 		.replace(/\n\s+\n/g, "\n") // Blank lines with whitespace
// 		.replace(/\s{2,}/g, " ") // Multiple spaces to one
// 		.trim();

// 	// Step 8: Remove very short lines (likely navigation remnants)
// 	const lines = text.split("\n")
// 		.map(line => line.trim())
// 		.filter(line => line.length > 20 || line.startsWith("---"));

// 	text = lines.join("\n").trim();

// 	return text;
// }
