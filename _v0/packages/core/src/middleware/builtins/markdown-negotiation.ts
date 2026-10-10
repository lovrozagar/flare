/**
 * Markdown content negotiation — opt-in builtin. Converts the HTML response to
 * Markdown when the request carries `Accept: text/markdown`. Subpath export,
 * tree-shaken when unused.
 *
 * Pattern cribbed from `@markdown-for-agents/web` + Vercel's content-negotiation
 * guide:
 *   - always advertise `Vary: Accept` so caches keep HTML + Markdown variants
 *     separate under the same URL
 *   - convert 2xx `text/html` responses only; everything else passes through
 *   - set `Content-Type: text/markdown; charset=utf-8`, drop stale
 *     `Content-Length`, attach an optional `x-markdown-tokens` rough estimate
 *
 * Default converter is lazily imported `node-html-markdown` (pure JS, no DOM,
 * CF Worker safe). Pass a custom `convert` to swap engines and keep the peer
 * dep out of your bundle entirely.
 */

import type { FlareMiddleware } from "..";

type Convert = (html: string) => string | Promise<string>;

export interface MarkdownNegotiationOptions {
	/** Custom HTML → Markdown converter. Omit to use lazy `node-html-markdown`. */
	convert?: Convert;
	/** Opt-in token header (GPT/Claude-style ~4 chars/token estimate). Default `true`. */
	emitTokenHeader?: boolean;
	/** Upper bound on HTML body size in bytes — larger responses pass through. Default 2 MiB. */
	maxBytes?: number;
	/** Per-request gate. Return `false` to skip conversion (e.g. interactive routes). */
	when?: (input: { request: Request; url: URL }) => boolean;
}

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

function acceptsMarkdown(request: Request): boolean {
	const accept = request.headers.get("accept");
	if (!accept) return false;
	/* Substring match — RFC 7231 q-value parse is overkill here.
	   `text/html, text/markdown;q=0.9` matches; `text/html` does not. */
	return accept.includes("text/markdown");
}

async function defaultConvert(html: string): Promise<string> {
	/* Dynamic import so the peer dep is only loaded by consumers who import
	   this middleware. Bundlers (Vite / esbuild) pre-bundle it as a separate
	   chunk — required for CF Workers which have no runtime module loader. */
	const { NodeHtmlMarkdown } = await import("node-html-markdown");
	return NodeHtmlMarkdown.translate(html);
}

function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

export function markdownNegotiation<TEnv = unknown>(options: MarkdownNegotiationOptions = {}): FlareMiddleware<TEnv> {
	const convert = options.convert ?? defaultConvert;
	const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
	const emitTokenHeader = options.emitTokenHeader ?? true;

	return (ctx) => {
		/* Always advertise Accept-based variance so shared caches don't serve
		   the wrong representation. Added even on requests that won't convert
		   — the HTML response still has an MD counterpart under the same URL. */
		ctx.onResponse((response) => {
			response.headers.append("vary", "Accept");
			return response;
		});

		if (!acceptsMarkdown(ctx.request)) return ctx.next();
		if (options.when && !options.when({ request: ctx.request, url: ctx.url })) {
			return ctx.next();
		}

		ctx.onResponse(async (response) => {
			if (!response.ok) return response;

			const contentType = response.headers.get("content-type") ?? "";
			if (!contentType.startsWith("text/html")) return response;

			/* Status codes that forbid a body (Response constructor throws if we
			   try to give them one). Pass through unconverted. */
			if (response.status === 204 || response.status === 205 || response.status === 304) {
				return response;
			}

			/* Pre-flight size check using Content-Length when present — avoids
			   buffering multi-MB responses just to reject them. */
			const declaredLength = Number(response.headers.get("content-length") ?? 0);
			if (declaredLength > 0 && declaredLength > maxBytes) return response;

			let html: string;
			try {
				html = await response.text();
			} catch {
				/* Body read failure — upstream closed stream or similar. Nothing
				   we can do; return original response (stream may already be dead,
				   but caller must handle that case regardless). */
				return response;
			}

			if (html.length > maxBytes) {
				/* Rebuild from captured body so the stream isn't consumed downstream. */
				return new Response(html, {
					headers: response.headers,
					status: response.status,
					statusText: response.statusText,
				});
			}

			let markdown: string;
			try {
				markdown = await convert(html);
			} catch {
				/* Conversion failure must not break the page — return the HTML we
				   already buffered so the client gets a working response. */
				return new Response(html, {
					headers: response.headers,
					status: response.status,
					statusText: response.statusText,
				});
			}

			const headers = new Headers(response.headers);
			headers.set("content-type", "text/markdown; charset=utf-8");
			/* Length changes; drop the stale header so downstream recomputes. */
			headers.delete("content-length");
			if (emitTokenHeader) {
				headers.set("x-markdown-tokens", String(estimateTokens(markdown)));
			}

			return new Response(markdown, {
				headers,
				status: response.status,
				statusText: response.statusText,
			});
		});

		return ctx.next();
	};
}
