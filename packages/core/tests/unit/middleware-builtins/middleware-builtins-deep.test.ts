import { describe, expect, it, vi } from "vitest";
import type { MiddlewareContext } from "../../../src/middleware/index.ts";
import { apiProxy } from "../../../src/middleware/builtins/api-proxy.ts";
import { cdnProxy } from "../../../src/middleware/builtins/cdn-proxy.ts";
import { i18n } from "../../../src/middleware/builtins/i18n.ts";
import { staticAssets } from "../../../src/middleware/builtins/static-assets.ts";

function makeCtx<TEnv = unknown>(url: string, overrides?: Partial<MiddlewareContext<TEnv>>): MiddlewareContext<TEnv> {
	const parsedUrl = new URL(url);
	return {
		bypass: (response: Response) => Object.freeze({ response, type: "bypass" as const }),
		env: {} as TEnv,
		next: () => Promise.resolve(Object.freeze({ type: "next" as const })),
		nonce: "test-nonce",
		onResponse: () => {},
		request: new Request(url),
		requestType: "page" as const,
		respond: (response: Response) => Object.freeze({ response, type: "respond" as const }),
		serverContext: {},
		url: parsedUrl,
		...overrides,
	} as MiddlewareContext<TEnv>;
}

/* ── staticAssets edge cases ── */

describe("staticAssets deep", () => {
	it("empty paths array → always passes to next", async () => {
		const mw = staticAssets({ paths: [] });
		const ctx = makeCtx("http://localhost/anything");
		ctx.next = vi.fn(() => Promise.resolve(Object.freeze({ type: "next" as const })));
		const result = await mw(ctx);
		expect(result.type).toBe("next");
		expect(ctx.next).toHaveBeenCalled();
	});

	it("ASSETS.fetch throws → error propagated", async () => {
		const mw = staticAssets({ paths: ["/assets/"] });
		const ctx = makeCtx("http://localhost/assets/app.js", {
			env: {
				ASSETS: {
					fetch: () => {
						throw new Error("fetch failed");
					},
				},
			},
		});
		await expect(mw(ctx)).rejects.toThrow("fetch failed");
	});

	it("prefix without trailing slash → exact match only", async () => {
		const mw = staticAssets({ paths: ["/assets"] });
		const fetchFn = vi.fn(async () => new Response(""));
		const ctx = makeCtx("http://localhost/assets/app.js", {
			env: { ASSETS: { fetch: fetchFn } },
		});
		/* "/assets" is an exact path (no trailing /), so "/assets/app.js" should not match */
		ctx.next = vi.fn(() => Promise.resolve(Object.freeze({ type: "next" as const })));
		const result = await mw(ctx);
		expect(result.type).toBe("next");
	});

	it("multiple prefix paths, only matching one used", async () => {
		const fetchFn = vi.fn(async () => new Response("static"));
		const mw = staticAssets({ paths: ["/static/", "/public/"] });
		const ctx = makeCtx("http://localhost/public/img.png", {
			env: { ASSETS: { fetch: fetchFn } },
		});
		const result = await mw(ctx);
		expect(result.type).toBe("bypass");
		expect(fetchFn).toHaveBeenCalled();
	});

	it("no ASSETS binding → passes to next", async () => {
		const mw = staticAssets({ paths: ["/assets/"] });
		const ctx = makeCtx("http://localhost/assets/app.js", { env: {} });
		ctx.next = vi.fn(() => Promise.resolve(Object.freeze({ type: "next" as const })));
		const result = await mw(ctx);
		expect(result.type).toBe("next");
	});
});

/* ── apiProxy deep ── */

describe("apiProxy deep", () => {
	it("query string preserved in proxied request", async () => {
		let capturedUrl: string | undefined;
		const targetFetch = vi.fn(async (req: Request) => {
			capturedUrl = req.url;
			return new Response("");
		});
		const mw = apiProxy({
			pathPrefix: "/api",
			target: () => ({ fetch: targetFetch }),
		});
		const ctx = makeCtx("http://localhost/api/users?page=2&limit=10");
		await mw(ctx);
		const parsed = new URL(capturedUrl ?? "");
		expect(parsed.searchParams.get("page")).toBe("2");
		expect(parsed.searchParams.get("limit")).toBe("10");
	});

	it("request method forwarded to proxy request", async () => {
		let capturedMethod: string | undefined;
		const targetFetch = vi.fn(async (req: Request) => {
			capturedMethod = req.method;
			return new Response("");
		});
		const mw = apiProxy({
			pathPrefix: "/api",
			target: () => ({ fetch: targetFetch }),
		});
		const ctx = makeCtx("http://localhost/api/users", {
			request: new Request("http://localhost/api/users", { method: "DELETE" }),
		});
		await mw(ctx);
		expect(capturedMethod).toBe("DELETE");
	});

	it("default rewrite strips prefix → /api/users → /users", async () => {
		let capturedPath: string | undefined;
		const targetFetch = vi.fn(async (req: Request) => {
			capturedPath = new URL(req.url).pathname;
			return new Response("");
		});
		const mw = apiProxy({
			pathPrefix: "/api",
			target: () => ({ fetch: targetFetch }),
		});
		const ctx = makeCtx("http://localhost/api/users");
		await mw(ctx);
		expect(capturedPath).toBe("/users");
	});

	it("exact prefix /api without sub-path → rewrites to /", async () => {
		let capturedPath: string | undefined;
		const targetFetch = vi.fn(async (req: Request) => {
			capturedPath = new URL(req.url).pathname;
			return new Response("");
		});
		const mw = apiProxy({
			pathPrefix: "/api",
			target: () => ({ fetch: targetFetch }),
		});
		const ctx = makeCtx("http://localhost/api");
		await mw(ctx);
		expect(capturedPath).toBe("/");
	});

	it("pathPrefix /api does NOT match /api-v2 (strict boundary)", async () => {
		const mw = apiProxy({
			pathPrefix: "/api",
			target: () => ({ fetch: vi.fn() }),
		});
		const ctx = makeCtx("http://localhost/api-v2/users");
		ctx.next = vi.fn(() => Promise.resolve(Object.freeze({ type: "next" as const })));
		const result = await mw(ctx);
		expect(result.type).toBe("next");
	});

	it("headers callback receives env and request", async () => {
		const headersFn = vi.fn(() => ({ "X-Test": "1" }));
		const targetFetch = vi.fn(async () => new Response(""));
		const env = { SECRET: "abc" };
		const mw = apiProxy({
			headers: headersFn,
			pathPrefix: "/api",
			target: () => ({ fetch: targetFetch }),
		});
		const ctx = makeCtx("http://localhost/api/test", { env });
		await mw(ctx);
		expect(headersFn).toHaveBeenCalledWith(
			expect.objectContaining({
				env,
				request: expect.any(Request),
			}),
		);
	});
});

/* ── cdnProxy deep ── */

describe("cdnProxy deep", () => {
	function makeR2Object(
		overrides?: Partial<{
			body: ReadableStream;
			etag: string;
			httpMetadata: { contentType?: string } | undefined;
			size: number;
		}>,
	) {
		return {
			body: new ReadableStream({
				start(c) {
					c.enqueue(new TextEncoder().encode("data"));
					c.close();
				},
			}),
			etag: '"abc"',
			httpMetadata: { contentType: "application/octet-stream" },
			size: 4,
			...overrides,
		};
	}

	it("custom cacheControl override used instead of default", async () => {
		const bucket = { get: vi.fn(async () => makeR2Object()) };
		const mw = cdnProxy({
			bucket: () => bucket,
			cacheControl: "public, max-age=60",
			pathPrefix: "/cdn",
		});
		const ctx = makeCtx("http://localhost/cdn/file.txt");
		const result = await mw(ctx);
		if (result.type === "bypass") {
			expect(result.response.headers.get("Cache-Control")).toBe("public, max-age=60");
		}
	});

	it("object without httpMetadata → no Content-Type header", async () => {
		const bucket = {
			get: vi.fn(async () => makeR2Object({ httpMetadata: undefined })),
		};
		const mw = cdnProxy({ bucket: () => bucket, pathPrefix: "/cdn" });
		const ctx = makeCtx("http://localhost/cdn/file.bin");
		const result = await mw(ctx);
		if (result.type === "bypass") {
			expect(result.response.headers.get("Content-Type")).toBeNull();
		}
	});

	it("object httpMetadata without contentType → no Content-Type header", async () => {
		const bucket = {
			get: vi.fn(async () => makeR2Object({ httpMetadata: {} })),
		};
		const mw = cdnProxy({ bucket: () => bucket, pathPrefix: "/cdn" });
		const ctx = makeCtx("http://localhost/cdn/file.bin");
		const result = await mw(ctx);
		if (result.type === "bypass") {
			expect(result.response.headers.get("Content-Type")).toBeNull();
		}
	});

	it("nested path key: /cdn/a/b/c.png → key = a/b/c.png", async () => {
		const bucket = { get: vi.fn(async () => makeR2Object()) };
		const mw = cdnProxy({ bucket: () => bucket, pathPrefix: "/cdn" });
		const ctx = makeCtx("http://localhost/cdn/a/b/c.png");
		await mw(ctx);
		expect(bucket.get).toHaveBeenCalledWith("a/b/c.png");
	});
});

/* ── i18n middleware ── */

const BROWSER_UA =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const i18nConfig = {
	defaultLocale: "en",
	locales: ["en", "hr", "fr"] as const,
};

function makeI18nCtx(
	url: string,
	headers?: Record<string, string>,
	locale?: { defaultLocale: string; locales: readonly string[] },
): { ctx: MiddlewareContext; responseHandlers: Array<(r: Response) => Response> } {
	const parsedUrl = new URL(url);
	const responseHandlers: Array<(r: Response) => Response> = [];
	const request = new Request(url, { headers: { "user-agent": BROWSER_UA, ...headers } });
	return {
		ctx: {
			bypass: (response: Response) => Object.freeze({ response, type: "bypass" as const }),
			env: {},
			locale: locale ?? i18nConfig,
			next: () => Promise.resolve(Object.freeze({ type: "next" as const })),
			onResponse: (fn: (r: Response) => Response) => {
				responseHandlers.push(fn);
			},
			request,
			requestType: "page" as const,
			respond: (response: Response) => Object.freeze({ response, type: "respond" as const }),
			serverContext: {} as Record<string, unknown>,
			url: parsedUrl,
		} as unknown as MiddlewareContext,
		responseHandlers,
	};
}

describe("i18n middleware", () => {
	const mw = i18n();

	it("sets serverContext.locale to default for unprefixed path", async () => {
		const { ctx } = makeI18nCtx("http://localhost/about");
		await mw(ctx);
		expect(ctx.serverContext.locale).toBe("en");
	});

	it("sets serverContext.locale from path prefix", async () => {
		const { ctx } = makeI18nCtx("http://localhost/hr/about");
		await mw(ctx);
		expect(ctx.serverContext.locale).toBe("hr");
	});

	it("sets Set-Cookie when locale differs from cookie", async () => {
		const { ctx, responseHandlers } = makeI18nCtx("http://localhost/fr/about", {
			cookie: "flare.locale=en",
		});
		await mw(ctx);
		expect(responseHandlers.length).toBe(1);
		const response = new Response(null);
		const result = responseHandlers[0](response);
		expect(result.headers.get("set-cookie")).toContain("flare.locale=fr");
	});

	it("no Set-Cookie when locale matches cookie", async () => {
		const { ctx, responseHandlers } = makeI18nCtx("http://localhost/fr/about", {
			cookie: "flare.locale=fr",
		});
		await mw(ctx);
		expect(responseHandlers.length).toBe(0);
	});

	it("prefetch (x-p: 1) does NOT set cookie even when locale differs", async () => {
		const { ctx, responseHandlers } = makeI18nCtx("http://localhost/hr/about", {
			cookie: "flare.locale=en",
			"x-p": "1",
		});
		await mw(ctx);
		expect(responseHandlers.length).toBe(0);
		expect(ctx.serverContext.locale).toBe("hr");
	});

	it("prefetch to default locale does NOT set cookie", async () => {
		const { ctx, responseHandlers } = makeI18nCtx("http://localhost/about", {
			cookie: "flare.locale=fr",
			"x-d": "1",
			"x-p": "1",
		});
		await mw(ctx);
		expect(responseHandlers.length).toBe(0);
		expect(ctx.serverContext.locale).toBe("en");
	});

	it("SSR /about with cookie=fr → 302 → /fr/about (cookie-respect redirect)", async () => {
		const { ctx } = makeI18nCtx("http://localhost/about", {
			cookie: "flare.locale=fr",
		});
		const result = await mw(ctx);
		expect(result.type).toBe("bypass");
		if (result.type === "bypass") {
			expect(result.response.status).toBe(302);
			expect(result.response.headers.get("location")).toContain("/fr/about");
		}
	});

	it("SSR / with cookie=hr → 302 → /hr", async () => {
		const { ctx } = makeI18nCtx("http://localhost/", {
			cookie: "flare.locale=hr",
		});
		const result = await mw(ctx);
		expect(result.type).toBe("bypass");
		if (result.type === "bypass") {
			expect(result.response.status).toBe(302);
			expect(result.response.headers.get("location")).toContain("/hr/");
		}
	});

	it("SSR /about with cookie=en → no redirect (default locale)", async () => {
		const { ctx } = makeI18nCtx("http://localhost/about", {
			cookie: "flare.locale=en",
		});
		const result = await mw(ctx);
		expect(result.type).toBe("next");
		expect(ctx.serverContext.locale).toBe("en");
	});

	it("NDJSON /about with cookie=fr → no redirect (SPA handles routing)", async () => {
		const { ctx } = makeI18nCtx("http://localhost/about", {
			cookie: "flare.locale=fr",
			"x-d": "1",
		});
		const result = await mw(ctx);
		expect(result.type).toBe("next");
		expect(ctx.serverContext.locale).toBe("en");
	});

	it("NDJSON navigation (x-d: 1, no x-p) DOES set cookie", async () => {
		const { ctx, responseHandlers } = makeI18nCtx("http://localhost/hr/about", {
			cookie: "flare.locale=en",
			"x-d": "1",
		});
		await mw(ctx);
		expect(responseHandlers.length).toBe(1);
		const response = new Response(null);
		const result = responseHandlers[0](response);
		expect(result.headers.get("set-cookie")).toContain("flare.locale=hr");
	});

	it("default locale in URL → 302 redirect to strip prefix", async () => {
		const { ctx } = makeI18nCtx("http://localhost/en/about");
		const result = await mw(ctx);
		expect(result.type).toBe("bypass");
		if (result.type === "bypass") {
			expect(result.response.status).toBe(302);
			expect(result.response.headers.get("location")).toContain("/about");
		}
	});

	it("skips /_fn/ paths", async () => {
		const { ctx } = makeI18nCtx("http://localhost/_fn/some-action");
		const result = await mw(ctx);
		expect(result.type).toBe("next");
		expect(ctx.serverContext.locale).toBe("en");
	});

	it("skips file extensions", async () => {
		const { ctx } = makeI18nCtx("http://localhost/assets/app.js");
		const result = await mw(ctx);
		expect(result.type).toBe("next");
		expect(ctx.serverContext.locale).toBe("en");
	});

	it("case normalization: /EN-US/ → 302 to /en-us/", async () => {
		const mwWithEnUs = i18n();
		const { ctx } = makeI18nCtx("http://localhost/EN-US/about", undefined, {
			defaultLocale: "en",
			locales: ["en", "en-us", "hr"],
		});
		const result = await mwWithEnUs(ctx);
		expect(result.type).toBe("bypass");
		if (result.type === "bypass") {
			expect(result.response.status).toBe(302);
			expect(result.response.headers.get("location")).toContain("/en-us/about");
		}
	});

	it("unsupported locale-like segment → 302 strip", async () => {
		const { ctx } = makeI18nCtx("http://localhost/de/about");
		const result = await mw(ctx);
		expect(result.type).toBe("bypass");
		if (result.type === "bypass") {
			expect(result.response.status).toBe(302);
			expect(result.response.headers.get("location")).toContain("/about");
		}
	});

	it("cookie with dot name parsed correctly", async () => {
		const mwCustom = i18n({ cookieName: "my.app.locale" });
		const { ctx, responseHandlers } = makeI18nCtx("http://localhost/fr/about", {
			cookie: "my.app.locale=fr",
		});
		await mwCustom(ctx);
		expect(responseHandlers.length).toBe(0);
	});
});
