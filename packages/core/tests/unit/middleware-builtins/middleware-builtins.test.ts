import { describe, expect, it, vi } from "vitest";
import type { MiddlewareContext } from "../../../src/middleware/index.ts";
import { apiProxy } from "../../../src/middleware/builtins/api-proxy.ts";
import { cdnProxy } from "../../../src/middleware/builtins/cdn-proxy.ts";
import { staticAssets } from "../../../src/middleware/builtins/static-assets.ts";

function makeCtx(url: string, overrides?: Partial<MiddlewareContext>): MiddlewareContext {
	const parsedUrl = new URL(url);
	return {
		bypass: (response: Response) => Object.freeze({ response, type: "bypass" as const }),
		env: {},
		next: () => Promise.resolve(Object.freeze({ type: "next" as const })),
		onResponse: () => {},
		request: new Request(url),
		requestType: "page" as const,
		respond: (response: Response) => Object.freeze({ response, type: "respond" as const }),
		url: parsedUrl,
		...overrides,
	} as MiddlewareContext;
}

describe("staticAssets", () => {
	const mw = staticAssets({ paths: ["/assets/", "/favicon.ico"] });

	it("prefix path → ASSETS.fetch + bypass", async () => {
		const fetchFn = vi.fn(async () => new Response("js content"));
		const ctx = makeCtx("http://localhost/assets/app.js", { env: { ASSETS: { fetch: fetchFn } } });
		const result = await mw(ctx);
		expect(result.type).toBe("bypass");
		expect(fetchFn).toHaveBeenCalled();
	});

	it("exact path → ASSETS.fetch + bypass", async () => {
		const fetchFn = vi.fn(async () => new Response("icon"));
		const ctx = makeCtx("http://localhost/favicon.ico", { env: { ASSETS: { fetch: fetchFn } } });
		const result = await mw(ctx);
		expect(result.type).toBe("bypass");
	});

	it("no match → next", async () => {
		const ctx = makeCtx("http://localhost/about");
		const nextSpy = vi.fn(() => Promise.resolve(Object.freeze({ type: "next" as const })));
		ctx.next = nextSpy;
		const result = await mw(ctx);
		expect(result.type).toBe("next");
		expect(nextSpy).toHaveBeenCalled();
	});

	it("prefix matches sub-paths", async () => {
		const fetchFn = vi.fn(async () => new Response(""));
		const ctx = makeCtx("http://localhost/assets/css/main.css", {
			env: { ASSETS: { fetch: fetchFn } },
		});
		const result = await mw(ctx);
		expect(result.type).toBe("bypass");
	});
});

describe("apiProxy", () => {
	it("matches pathPrefix → forwards to target", async () => {
		const targetFetch = vi.fn(async () => new Response("api response"));
		const mw = apiProxy({
			pathPrefix: "/api",
			target: () => ({ fetch: targetFetch }),
		});
		const ctx = makeCtx("http://localhost/api/users");
		const result = await mw(ctx);
		expect(result.type).toBe("bypass");
		expect(targetFetch).toHaveBeenCalled();
	});

	it("no match → next", async () => {
		const mw = apiProxy({
			pathPrefix: "/api",
			target: () => ({ fetch: vi.fn() }),
		});
		const ctx = makeCtx("http://localhost/about");
		const nextSpy = vi.fn(() => Promise.resolve(Object.freeze({ type: "next" as const })));
		ctx.next = nextSpy;
		const result = await mw(ctx);
		expect(result.type).toBe("next");
	});

	it("enabled: false → next", async () => {
		const mw = apiProxy({
			enabled: false,
			pathPrefix: "/api",
			target: () => ({ fetch: vi.fn() }),
		});
		const ctx = makeCtx("http://localhost/api/users");
		const nextSpy = vi.fn(() => Promise.resolve(Object.freeze({ type: "next" as const })));
		ctx.next = nextSpy;
		const result = await mw(ctx);
		expect(result.type).toBe("next");
	});

	it("enabled: function → evaluated per request", async () => {
		const enabledFn = vi.fn(() => false);
		const mw = apiProxy({
			enabled: enabledFn,
			pathPrefix: "/api",
			target: () => ({ fetch: vi.fn() }),
		});
		const ctx = makeCtx("http://localhost/api/users");
		await mw(ctx);
		expect(enabledFn).toHaveBeenCalledWith({ env: ctx.env });
	});

	it("rewrite transforms path", async () => {
		let capturedUrl: string | undefined;
		const targetFetch = vi.fn(async (req: Request) => {
			capturedUrl = new URL(req.url).pathname;
			return new Response("");
		});
		const mw = apiProxy({
			pathPrefix: "/api",
			rewrite: (path) => path.replace("/api", "/v2"),
			target: () => ({ fetch: targetFetch }),
		});
		const ctx = makeCtx("http://localhost/api/users");
		await mw(ctx);
		expect(capturedUrl).toBe("/v2/users");
	});

	it("custom headers added to proxied request", async () => {
		let capturedHeaders: Headers | undefined;
		const targetFetch = vi.fn(async (req: Request) => {
			capturedHeaders = req.headers;
			return new Response("");
		});
		const mw = apiProxy({
			headers: () => ({ "X-Custom": "value" }),
			pathPrefix: "/api",
			target: () => ({ fetch: targetFetch }),
		});
		const ctx = makeCtx("http://localhost/api/test");
		await mw(ctx);
		expect(capturedHeaders?.get("X-Custom")).toBe("value");
	});

	it("exact pathPrefix match → forwards", async () => {
		const targetFetch = vi.fn(async () => new Response(""));
		const mw = apiProxy({
			pathPrefix: "/api",
			target: () => ({ fetch: targetFetch }),
		});
		const ctx = makeCtx("http://localhost/api");
		const result = await mw(ctx);
		expect(result.type).toBe("bypass");
	});
});

describe("cdnProxy", () => {
	it("matches prefix → fetches from R2", async () => {
		const body = new ReadableStream({
			start(c) {
				c.enqueue(new TextEncoder().encode("file"));
				c.close();
			},
		});
		const bucket = {
			get: vi.fn(async () => ({
				body,
				etag: '"abc"',
				httpMetadata: { contentType: "image/png" },
				size: 4,
			})),
		};
		const mw = cdnProxy({ bucket: () => bucket, pathPrefix: "/cdn" });
		const ctx = makeCtx("http://localhost/cdn/img.png");
		const result = await mw(ctx);
		expect(result.type).toBe("bypass");
		expect(bucket.get).toHaveBeenCalledWith("img.png");
	});

	it("missing object → 404 bypass", async () => {
		const bucket = { get: vi.fn(async () => null) };
		const mw = cdnProxy({ bucket: () => bucket, pathPrefix: "/cdn" });
		const ctx = makeCtx("http://localhost/cdn/missing.png");
		const result = await mw(ctx);
		expect(result.type).toBe("bypass");
		if (result.type === "bypass") {
			expect(result.response.status).toBe(404);
		}
	});

	it("sets Cache-Control, Content-Type, ETag headers", async () => {
		const body = new ReadableStream({
			start(c) {
				c.close();
			},
		});
		const bucket = {
			get: vi.fn(async () => ({
				body,
				etag: '"xyz"',
				httpMetadata: { contentType: "text/css" },
				size: 100,
			})),
		};
		const mw = cdnProxy({ bucket: () => bucket, pathPrefix: "/cdn" });
		const ctx = makeCtx("http://localhost/cdn/styles.css");
		const result = await mw(ctx);
		if (result.type === "bypass") {
			expect(result.response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
			expect(result.response.headers.get("Content-Type")).toBe("text/css");
			expect(result.response.headers.get("ETag")).toBe('"xyz"');
		}
	});

	it("no match → next", async () => {
		const mw = cdnProxy({ bucket: () => ({ get: vi.fn() }), pathPrefix: "/cdn" });
		const ctx = makeCtx("http://localhost/about");
		const nextSpy = vi.fn(() => Promise.resolve(Object.freeze({ type: "next" as const })));
		ctx.next = nextSpy;
		await mw(ctx);
		expect(nextSpy).toHaveBeenCalled();
	});
});
