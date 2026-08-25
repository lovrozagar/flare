/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import type { PrerenderRoute } from "../../../src/prerender/index.ts";
import { prerender } from "../../../src/prerender/index.ts";
import type { ServerHandler } from "../../../src/server-handler/index.ts";

/* ── helpers ──────────────────────────────────────────────────────── */

function makeHandler(responses: Map<string, { body: string; headers?: Record<string, string> }>): ServerHandler {
	return {
		async fetch(request: Request): Promise<Response> {
			const url = new URL(request.url);
			const isData = request.headers.get("flare-data") === "1";
			const key = isData ? `ndjson:${url.pathname}` : url.pathname;

			const entry = responses.get(key);
			if (!entry) {
				return new Response("Not Found", { status: 404 });
			}

			return new Response(entry.body, {
				headers: {
					"Content-Type": isData ? "application/x-ndjson" : "text/html; charset=utf-8",
					...entry.headers,
				},
				status: 200,
			});
		},
	};
}

function makeRoute(overrides: Partial<PrerenderRoute> & { pathname: string }): PrerenderRoute {
	return {
		mode: "static",
		...overrides,
	};
}

function htmlWithNonce(nonce: string): string {
	return [
		"<!DOCTYPE html><html><head>",
		`<meta name="csp-nonce" nonce="${nonce}">`,
		`<script nonce="${nonce}">self.flare={}</script>`,
		"</head><body>",
		"<div>Hello</div>",
		`<script nonce="${nonce}" type="module" async>import("/entry.js")</script>`,
		"</body></html>",
	].join("");
}

function ndjsonBody(lines: string[]): string {
	return lines.map((l) => `${l}\n`).join("");
}

/* ── route discovery ─────────────────────────────────────────────── */

describe("prerender — route discovery", () => {
	it("collects static routes (mode: static)", async () => {
		const nonce = "abc123";
		const handler = makeHandler(
			new Map([
				["/about", { body: htmlWithNonce(nonce) }],
				[
					"ndjson:/about",
					{
						body: ndjsonBody([
							JSON.stringify({ d: { content: "About" }, m: "m1", t: "l" }),
							JSON.stringify({ t: "r" }),
							JSON.stringify({ t: "d" }),
						]),
					},
				],
			]),
		);

		const result = await prerender({
			handler,
			origin: "http://localhost:3000",
			routes: [makeRoute({ pathname: "/about" })],
		});

		expect(result.errors).toEqual([]);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]?.pathname).toBe("/about");
		expect(result.entries[0]?.mode).toBe("static");
	});

	it("collects ISR routes (mode: isr)", async () => {
		const nonce = "abc123";
		const handler = makeHandler(
			new Map([
				["/products/1", { body: htmlWithNonce(nonce) }],
				[
					"ndjson:/products/1",
					{
						body: ndjsonBody([
							JSON.stringify({ d: {}, m: "m1", t: "l" }),
							JSON.stringify({ t: "r" }),
							JSON.stringify({ t: "d" }),
						]),
					},
				],
			]),
		);

		const result = await prerender({
			handler,
			origin: "http://localhost:3000",
			routes: [
				makeRoute({
					mode: "isr",
					pathname: "/products/1",
					revalidate: 300,
				}),
			],
		});

		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]?.mode).toBe("isr");
		expect(result.entries[0]?.revalidate).toBe(300);
	});

	it("handles multiple routes in parallel", async () => {
		const nonce = "abc123";
		const responses = new Map<string, { body: string }>();
		const paths = ["/", "/about", "/pricing"];
		for (const p of paths) {
			responses.set(p, { body: htmlWithNonce(nonce) });
			responses.set(`ndjson:${p}`, {
				body: ndjsonBody([
					JSON.stringify({ d: {}, m: "m1", t: "l" }),
					JSON.stringify({ t: "r" }),
					JSON.stringify({ t: "d" }),
				]),
			});
		}

		const handler = makeHandler(responses);
		const result = await prerender({
			handler,
			origin: "http://localhost:3000",
			routes: paths.map((p) => makeRoute({ pathname: p })),
		});

		expect(result.entries).toHaveLength(3);
		expect(result.entries.map((e) => e.pathname).sort()).toEqual(["/", "/about", "/pricing"]);
	});

	it("skips excluded paths", async () => {
		const nonce = "abc123";
		const handler = makeHandler(
			new Map([
				["/about", { body: htmlWithNonce(nonce) }],
				[
					"ndjson:/about",
					{
						body: ndjsonBody([
							JSON.stringify({ d: {}, m: "m1", t: "l" }),
							JSON.stringify({ t: "r" }),
							JSON.stringify({ t: "d" }),
						]),
					},
				],
			]),
		);

		const result = await prerender({
			exclude: ["/about"],
			handler,
			origin: "http://localhost:3000",
			routes: [makeRoute({ pathname: "/about" })],
		});

		expect(result.entries).toHaveLength(0);
		expect(result.errors).toHaveLength(0);
	});
});

/* ── nonce replacement ───────────────────────────────────────────── */

describe("prerender — nonce replacement", () => {
	it("replaces real nonce with __FLARE_NONCE__ placeholder", async () => {
		const nonce = "abc123deadbeef";
		const handler = makeHandler(
			new Map([
				["/about", { body: htmlWithNonce(nonce) }],
				[
					"ndjson:/about",
					{
						body: ndjsonBody([
							JSON.stringify({ d: {}, m: "m1", t: "l" }),
							JSON.stringify({ t: "r" }),
							JSON.stringify({ t: "d" }),
						]),
					},
				],
			]),
		);

		const result = await prerender({
			handler,
			origin: "http://localhost:3000",
			routes: [makeRoute({ pathname: "/about" })],
		});

		const entry = result.entries[0];
		expect(entry?.html).toContain("__FLARE_NONCE__");
		expect(entry?.html).not.toContain(nonce);
	});

	it("replaces nonce in CSP header too", async () => {
		const nonce = "abc123deadbeef";
		const handler = makeHandler(
			new Map([
				[
					"/about",
					{
						body: htmlWithNonce(nonce),
						headers: {
							"Content-Security-Policy": `script-src 'self' 'nonce-${nonce}'`,
						},
					},
				],
				[
					"ndjson:/about",
					{
						body: ndjsonBody([
							JSON.stringify({ d: {}, m: "m1", t: "l" }),
							JSON.stringify({ t: "r" }),
							JSON.stringify({ t: "d" }),
						]),
					},
				],
			]),
		);

		const result = await prerender({
			handler,
			origin: "http://localhost:3000",
			routes: [makeRoute({ pathname: "/about" })],
		});

		const entry = result.entries[0];
		/* Headers API lowercases all keys */
		expect(entry?.headers["content-security-policy"]).toContain("__FLARE_NONCE__");
		expect(entry?.headers["content-security-policy"]).not.toContain(nonce);
	});
});

/* ── NDJSON collection ───────────────────────────────────────────── */

describe("prerender — NDJSON collection", () => {
	it("stores raw NDJSON response body", async () => {
		const nonce = "abc123";
		const ndjson = ndjsonBody([
			JSON.stringify({ d: { title: "About" }, m: "m1", t: "l" }),
			JSON.stringify({ t: "r" }),
			JSON.stringify({ t: "d" }),
		]);

		const handler = makeHandler(
			new Map([
				["/about", { body: htmlWithNonce(nonce) }],
				["ndjson:/about", { body: ndjson }],
			]),
		);

		const result = await prerender({
			handler,
			origin: "http://localhost:3000",
			routes: [makeRoute({ pathname: "/about" })],
		});

		expect(result.entries[0]?.ndjson).toBe(ndjson);
	});
});

/* ── manifest generation ─────────────────────────────────────────── */

describe("prerender — manifest entries", () => {
	it("generates manifest entry with correct fields for static route", async () => {
		const nonce = "abc123";
		const handler = makeHandler(
			new Map([
				["/about", { body: htmlWithNonce(nonce) }],
				[
					"ndjson:/about",
					{
						body: ndjsonBody([
							JSON.stringify({ d: {}, m: "m1", t: "l" }),
							JSON.stringify({ t: "r" }),
							JSON.stringify({ t: "d" }),
						]),
					},
				],
			]),
		);

		const result = await prerender({
			handler,
			origin: "http://localhost:3000",
			routes: [
				makeRoute({
					defer: "resolve",
					pathname: "/about",
					tags: ["about"],
				}),
			],
		});

		const entry = result.entries[0];
		expect(entry).toBeDefined();
		expect(entry?.mode).toBe("static");
		expect(entry?.pathname).toBe("/about");
		expect(entry?.defer).toBe("resolve");
		expect(entry?.tags).toEqual(["about"]);
		expect(entry?.revalidate).toBeUndefined();
	});

	it("generates manifest entry for ISR with revalidate and dynamicParams", async () => {
		const nonce = "abc123";
		const handler = makeHandler(
			new Map([
				["/products/1", { body: htmlWithNonce(nonce) }],
				[
					"ndjson:/products/1",
					{
						body: ndjsonBody([
							JSON.stringify({ d: {}, m: "m1", t: "l" }),
							JSON.stringify({ t: "r" }),
							JSON.stringify({ t: "d" }),
						]),
					},
				],
			]),
		);

		const result = await prerender({
			handler,
			origin: "http://localhost:3000",
			routes: [
				makeRoute({
					dynamicParams: false,
					mode: "isr",
					pathname: "/products/1",
					revalidate: 60,
				}),
			],
		});

		const entry = result.entries[0];
		expect(entry?.mode).toBe("isr");
		expect(entry?.revalidate).toBe(60);
		expect(entry?.dynamicParams).toBe(false);
	});
});

/* ── error handling ──────────────────────────────────────────────── */

describe("prerender — error handling", () => {
	it("captures fetch errors as error entries", async () => {
		const handler: ServerHandler = {
			async fetch(): Promise<Response> {
				throw new Error("Handler crashed");
			},
		};

		const result = await prerender({
			handler,
			origin: "http://localhost:3000",
			routes: [makeRoute({ pathname: "/crash" })],
		});

		expect(result.entries).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.pathname).toBe("/crash");
		expect(result.errors[0]?.message).toContain("Handler crashed");
	});

	it("captures non-200 HTML responses as errors", async () => {
		const handler: ServerHandler = {
			async fetch(): Promise<Response> {
				return new Response("Not Found", { status: 404 });
			},
		};

		const result = await prerender({
			handler,
			origin: "http://localhost:3000",
			routes: [makeRoute({ pathname: "/missing" })],
		});

		expect(result.entries).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.pathname).toBe("/missing");
		expect(result.errors[0]?.message).toContain("404");
	});

	it("continues rendering other routes when one fails", async () => {
		const nonce = "abc123";

		const handler: ServerHandler = {
			async fetch(request: Request): Promise<Response> {
				const url = new URL(request.url);
				const isData = request.headers.get("flare-data") === "1";

				if (url.pathname === "/crash") {
					throw new Error("boom");
				}

				if (isData) {
					return new Response(
						ndjsonBody([
							JSON.stringify({ d: {}, m: "m1", t: "l" }),
							JSON.stringify({ t: "r" }),
							JSON.stringify({ t: "d" }),
						]),
						{
							headers: { "Content-Type": "application/x-ndjson" },
							status: 200,
						},
					);
				}

				return new Response(htmlWithNonce(nonce), {
					headers: { "Content-Type": "text/html; charset=utf-8" },
					status: 200,
				});
			},
		};

		const result = await prerender({
			handler,
			origin: "http://localhost:3000",
			routes: [makeRoute({ pathname: "/ok" }), makeRoute({ pathname: "/crash" })],
		});

		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]?.pathname).toBe("/ok");
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.pathname).toBe("/crash");
	});
});

/* ── synthetic request ───────────────────────────────────────────── */

describe("prerender — synthetic request shape", () => {
	it("sends GET requests with correct URL", async () => {
		const capturedRequests: Request[] = [];

		const nonce = "abc123";
		const handler: ServerHandler = {
			async fetch(request: Request): Promise<Response> {
				capturedRequests.push(request);
				const isData = request.headers.get("flare-data") === "1";
				if (isData) {
					return new Response(
						ndjsonBody([
							JSON.stringify({ d: {}, m: "m1", t: "l" }),
							JSON.stringify({ t: "r" }),
							JSON.stringify({ t: "d" }),
						]),
						{
							headers: { "Content-Type": "application/x-ndjson" },
							status: 200,
						},
					);
				}
				return new Response(htmlWithNonce(nonce), {
					headers: { "Content-Type": "text/html; charset=utf-8" },
					status: 200,
				});
			},
		};

		await prerender({
			handler,
			origin: "http://localhost:3000",
			routes: [makeRoute({ pathname: "/about" })],
		});

		expect(capturedRequests).toHaveLength(2);

		/* HTML request */
		const htmlReq = capturedRequests[0];
		expect(htmlReq?.method).toBe("GET");
		expect(new URL(htmlReq?.url ?? "").pathname).toBe("/about");
		expect(htmlReq?.headers.get("flare-data")).toBeNull();
		expect(htmlReq?.headers.get("flare-prerender")).toBe("1");

		/* NDJSON request */
		const dataReq = capturedRequests[1];
		expect(dataReq?.method).toBe("GET");
		expect(new URL(dataReq?.url ?? "").pathname).toBe("/about");
		expect(dataReq?.headers.get("flare-data")).toBe("1");
		expect(dataReq?.headers.get("flare-prerender")).toBe("1");
	});

	it("uses provided origin for request URLs", async () => {
		const capturedUrls: string[] = [];
		const nonce = "abc123";

		const handler: ServerHandler = {
			async fetch(request: Request): Promise<Response> {
				capturedUrls.push(request.url);
				const isData = request.headers.get("flare-data") === "1";
				if (isData) {
					return new Response(
						ndjsonBody([
							JSON.stringify({ d: {}, m: "m1", t: "l" }),
							JSON.stringify({ t: "r" }),
							JSON.stringify({ t: "d" }),
						]),
						{ headers: { "Content-Type": "application/x-ndjson" }, status: 200 },
					);
				}
				return new Response(htmlWithNonce(nonce), {
					headers: { "Content-Type": "text/html; charset=utf-8" },
					status: 200,
				});
			},
		};

		await prerender({
			handler,
			origin: "https://example.com",
			routes: [makeRoute({ pathname: "/about" })],
		});

		expect(capturedUrls[0]).toBe("https://example.com/about");
		expect(capturedUrls[1]).toBe("https://example.com/about");
	});
});

/* ── response headers ────────────────────────────────────────────── */

describe("prerender — response headers", () => {
	it("captures response headers from HTML response", async () => {
		const nonce = "abc123";
		const handler = makeHandler(
			new Map([
				[
					"/about",
					{
						body: htmlWithNonce(nonce),
						headers: {
							"Cache-Control": "public, max-age=3600",
							"Content-Type": "text/html; charset=utf-8",
							"Surrogate-Key": "about products",
						},
					},
				],
				[
					"ndjson:/about",
					{
						body: ndjsonBody([
							JSON.stringify({ d: {}, m: "m1", t: "l" }),
							JSON.stringify({ t: "r" }),
							JSON.stringify({ t: "d" }),
						]),
					},
				],
			]),
		);

		const result = await prerender({
			handler,
			origin: "http://localhost:3000",
			routes: [makeRoute({ pathname: "/about" })],
		});

		const entry = result.entries[0];
		/* Headers API lowercases all keys */
		expect(entry?.headers["surrogate-key"]).toBe("about products");
		expect(entry?.headers["cache-control"]).toBe("public, max-age=3600");
	});
});

/* ── env passing ─────────────────────────────────────────────────── */

describe("prerender — env", () => {
	it("passes env to handler.fetch", async () => {
		let capturedEnv: unknown;

		const nonce = "abc123";
		const handler: ServerHandler = {
			async fetch(request: Request, env: unknown): Promise<Response> {
				capturedEnv = env;
				const isData = request.headers.get("flare-data") === "1";
				if (isData) {
					return new Response(
						ndjsonBody([
							JSON.stringify({ d: {}, m: "m1", t: "l" }),
							JSON.stringify({ t: "r" }),
							JSON.stringify({ t: "d" }),
						]),
						{ headers: { "Content-Type": "application/x-ndjson" }, status: 200 },
					);
				}
				return new Response(htmlWithNonce(nonce), {
					headers: { "Content-Type": "text/html; charset=utf-8" },
					status: 200,
				});
			},
		};

		await prerender({
			env: { DB_URL: "postgres://..." },
			handler,
			origin: "http://localhost:3000",
			routes: [makeRoute({ pathname: "/about" })],
		});

		expect(capturedEnv).toEqual({ DB_URL: "postgres://..." });
	});

	it("resolves env factory function", async () => {
		let capturedEnv: unknown;

		const nonce = "abc123";
		const handler: ServerHandler = {
			async fetch(request: Request, env: unknown): Promise<Response> {
				capturedEnv = env;
				const isData = request.headers.get("flare-data") === "1";
				if (isData) {
					return new Response(
						ndjsonBody([
							JSON.stringify({ d: {}, m: "m1", t: "l" }),
							JSON.stringify({ t: "r" }),
							JSON.stringify({ t: "d" }),
						]),
						{ headers: { "Content-Type": "application/x-ndjson" }, status: 200 },
					);
				}
				return new Response(htmlWithNonce(nonce), {
					headers: { "Content-Type": "text/html; charset=utf-8" },
					status: 200,
				});
			},
		};

		await prerender({
			env: () => ({ DB_URL: "from-factory" }),
			handler,
			origin: "http://localhost:3000",
			routes: [makeRoute({ pathname: "/about" })],
		});

		expect(capturedEnv).toEqual({ DB_URL: "from-factory" });
	});

	it("resolves async env factory", async () => {
		let capturedEnv: unknown;

		const nonce = "abc123";
		const handler: ServerHandler = {
			async fetch(request: Request, env: unknown): Promise<Response> {
				capturedEnv = env;
				const isData = request.headers.get("flare-data") === "1";
				if (isData) {
					return new Response(
						ndjsonBody([
							JSON.stringify({ d: {}, m: "m1", t: "l" }),
							JSON.stringify({ t: "r" }),
							JSON.stringify({ t: "d" }),
						]),
						{ headers: { "Content-Type": "application/x-ndjson" }, status: 200 },
					);
				}
				return new Response(htmlWithNonce(nonce), {
					headers: { "Content-Type": "text/html; charset=utf-8" },
					status: 200,
				});
			},
		};

		await prerender({
			env: async () => ({ DB_URL: "from-async-factory" }),
			handler,
			origin: "http://localhost:3000",
			routes: [makeRoute({ pathname: "/about" })],
		});

		expect(capturedEnv).toEqual({ DB_URL: "from-async-factory" });
	});
});

/* ── concurrency control ─────────────────────────────────────────── */

describe("prerender — concurrency", () => {
	it("limits concurrent renders", async () => {
		let maxConcurrent = 0;
		let currentConcurrent = 0;
		const nonce = "abc123";

		const handler: ServerHandler = {
			async fetch(request: Request): Promise<Response> {
				currentConcurrent++;
				if (currentConcurrent > maxConcurrent) {
					maxConcurrent = currentConcurrent;
				}
				/* simulate work */
				await new Promise((r) => setTimeout(r, 10));
				currentConcurrent--;

				const isData = request.headers.get("flare-data") === "1";
				if (isData) {
					return new Response(
						ndjsonBody([
							JSON.stringify({ d: {}, m: "m1", t: "l" }),
							JSON.stringify({ t: "r" }),
							JSON.stringify({ t: "d" }),
						]),
						{ headers: { "Content-Type": "application/x-ndjson" }, status: 200 },
					);
				}
				return new Response(htmlWithNonce(nonce), {
					headers: { "Content-Type": "text/html; charset=utf-8" },
					status: 200,
				});
			},
		};

		const routes = Array.from({ length: 20 }, (_, i) => makeRoute({ pathname: `/page-${i}` }));

		const result = await prerender({
			concurrency: 4,
			handler,
			origin: "http://localhost:3000",
			routes,
		});

		expect(result.entries).toHaveLength(20);
		/* Each route does 2 fetches (HTML + NDJSON), so max concurrent fetches
		 * could be up to 2*concurrency. But route-level concurrency is 4. */
		expect(maxConcurrent).toBeLessThanOrEqual(8);
		expect(maxConcurrent).toBeGreaterThan(1);
	});
});

/* ── empty routes ────────────────────────────────────────────────── */

describe("prerender — edge cases", () => {
	it("returns empty result for no routes", async () => {
		const handler = makeHandler(new Map());

		const result = await prerender({
			handler,
			origin: "http://localhost:3000",
			routes: [],
		});

		expect(result.entries).toEqual([]);
		expect(result.errors).toEqual([]);
	});

	it("nonce extraction works with real CSP headers", async () => {
		/* Handler that generates a real nonce in CSP */
		const nonce = "a1b2c3d4e5f6";
		const html = htmlWithNonce(nonce);
		const handler = makeHandler(
			new Map([
				[
					"/",
					{
						body: html,
						headers: {
							"Content-Security-Policy": `script-src 'self' 'nonce-${nonce}'; object-src 'none'`,
						},
					},
				],
				[
					"ndjson:/",
					{
						body: ndjsonBody([
							JSON.stringify({ d: {}, m: "m1", t: "l" }),
							JSON.stringify({ t: "r" }),
							JSON.stringify({ t: "d" }),
						]),
					},
				],
			]),
		);

		const result = await prerender({
			handler,
			origin: "http://localhost:3000",
			routes: [makeRoute({ pathname: "/" })],
		});

		const entry = result.entries[0];
		expect(entry?.html).not.toContain(nonce);
		expect(entry?.html).toContain("__FLARE_NONCE__");
		/* Headers API lowercases all keys */
		expect(entry?.headers["content-security-policy"]).toContain("__FLARE_NONCE__");
		expect(entry?.headers["content-security-policy"]).not.toContain(nonce);
	});
});
