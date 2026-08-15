/**
 * @vitest-environment node
 *
 * Full SSR integration tests.
 * Mocks solid-js/web so renderToStream produces real HTML output.
 * Tests the complete pipeline: route matching → layout loading → pipeline
 * execution → head merging → FlareState building → stream injection →
 * security headers. No false positives — every assertion verifies real output.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const devRef = vi.hoisted(() => ({ current: true }));
vi.mock("virtual:flare-is-dev", () => ({
	get default() {
		return devRef.current;
	},
}));

afterEach(() => {
	devRef.current = true;
});

/* ── Mock solid-js/web before any imports that use it ────────────────── */

vi.mock("solid-js/web", async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>();
	return {
		...actual,
		Hydration: (props: { children: unknown }) => props.children,
		NoHydration: (props: { children: unknown }) => props.children,
		renderToStream: (factory: () => unknown) => {
			const content = String(factory() ?? "");
			const html = `<html lang="en"><head><title>Flare</title></head><body>${content}</body></html>`;
			return {
				pipeTo: (writable: WritableStream<string>) => {
					const writer = writable.getWriter();
					writer.write(html).then(() => writer.close());
				},
			};
		},
	};
});

vi.mock("../../src/theme", async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>();
	return {
		...actual,
		ThemeProvider: (props: { children: unknown }) => props.children,
	};
});

vi.mock("../../src/direction", async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>();
	return {
		...actual,
		DirectionProvider: (props: { children: unknown }) => props.children,
	};
});

vi.mock("../../src/broadcast/provider", () => ({
	BroadcastProvider: (props: { children: unknown }) => props.children,
}));

vi.mock("../../src/outlet", () => {
	let currentCtx: Record<string, unknown> = {};
	return {
		DepthContext: { id: Symbol("DepthContext") },
		FlareProvider: (props: {
			children: unknown;
			matches: Array<{
				_type: string;
				loaderData: unknown;
				render?: (p: Record<string, unknown>) => unknown;
				preloaderContext?: unknown;
			}>;
			params: Record<string, unknown>;
		}) => {
			currentCtx = { matches: props.matches };
			return props.children;
		},
		Outlet: () => {
			const matches = (currentCtx.matches ?? []) as Array<{
				_type: string;
				loaderData: unknown;
				preloaderContext?: unknown;
				render?: (p: Record<string, unknown>) => unknown;
			}>;
			let content: unknown = null;
			for (let i = matches.length - 1; i >= 0; i--) {
				const m = matches[i];
				if (!m?.render) continue;
				const isPage = m._type === "render" || m._type === "response";
				const props: Record<string, unknown> = {
					loaderData: m.loaderData,
					preloaderContext: m.preloaderContext,
				};
				if (!isPage) props.children = content;
				content = m.render(props);
			}
			return content;
		},
		RouterContext: {
			Provider: (props: { children: unknown }) => props.children,
			id: Symbol("RouterContext"),
		},
		useRouter: () => ({}),
	};
});

/* ── Imports (after mock) ────────────────────────────────────────────── */

const { alwaysAuthFn, buildHandler, extractFlareState, makeRequest, neverAuthFn, readResponseBody } =
	await import("./fixtures");

/* ── SSR HTML: basic responses ───────────────────────────────────────── */

describe("SSR — home page (no loader)", () => {
	it("returns 200 with text/html", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/home"), {});

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("text/html");
	});

	it("body contains rendered page content", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/home"), {});
		const html = await readResponseBody(response);

		expect(html).toContain("[home]");
	});

	it("body contains root layout wrapper", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/home"), {});
		const html = await readResponseBody(response);

		expect(html).toContain("[root-layout]");
		expect(html).toContain("[/root-layout]");
	});

	it("page content is nested inside root layout", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/home"), {});
		const html = await readResponseBody(response);

		const layoutStart = html.indexOf("[root-layout]");
		const pageContent = html.indexOf("[home]");
		const layoutEnd = html.indexOf("[/root-layout]");
		expect(layoutStart).toBeLessThan(pageContent);
		expect(pageContent).toBeLessThan(layoutEnd);
	});
});

describe("SSR — about page (loader + head)", () => {
	it("returns 200", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/about"), {});

		expect(response.status).toBe(200);
	});

	it("body contains loader data in rendered output", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/about"), {});
		const html = await readResponseBody(response);

		expect(html).toContain("[about:About]");
	});

	it("FlareState contains loader data", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/about"), {});
		const html = await readResponseBody(response);
		const state = extractFlareState(html);

		expect(state).not.toBeNull();
		const aboutMatch = state?.m.find((m) => m.v === "_root_/about");
		expect(aboutMatch).toBeDefined();
		expect(aboutMatch?.d).toEqual({ title: "About" });
	});

	it("FlareState contains head config", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/about"), {});
		const html = await readResponseBody(response);
		const state = extractFlareState(html);

		expect(state?.ph).toBeDefined();
		const aboutHead = state?.ph?.find((h) => h.matchId.includes("_root_/about"));
		expect(aboutHead).toBeDefined();
		expect((aboutHead?.head as Record<string, unknown>)?.title).toBe("About");
	});
});

describe("SSR — FlareState structure", () => {
	it("contains pathname (p)", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/home"), {});
		const html = await readResponseBody(response);
		const state = extractFlareState(html);

		expect(state?.p).toBe("/home");
	});

	it("contains params (r) — empty for static route", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/home"), {});
		const html = await readResponseBody(response);
		const state = extractFlareState(html);

		expect(state?.r).toEqual({});
	});

	it("contains search params (s)", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/home?q=test&lang=en"), {});
		const html = await readResponseBody(response);
		const state = extractFlareState(html);

		expect(state?.s).toEqual({ lang: "en", q: "test" });
	});

	it("contains match states (m) with matchId, virtualPath, loaderData", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/about"), {});
		const html = await readResponseBody(response);
		const state = extractFlareState(html);

		expect(state?.m.length).toBeGreaterThanOrEqual(2); /* root layout + page */
		for (const m of state?.m ?? []) {
			expect(m.i).toBeTruthy(); /* matchId */
			expect(m.v).toBeTruthy(); /* virtualPath */
		}
	});

	it("contains context (c) with router config", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/home"), {});
		const html = await readResponseBody(response);
		const state = extractFlareState(html);

		expect(state?.c).toBeDefined();
		expect(state?.c.router).toBeDefined();
	});

	it("FlareState script tag has nonce attribute", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/home"), {});
		const html = await readResponseBody(response);

		expect(html).toMatch(/<script nonce="[a-f0-9]+"/);
		expect(html).toContain("self.flare=");
	});
});

describe("SSR — parameterized route", () => {
	it("/users/42 renders with param data", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/users/42"), {});
		const html = await readResponseBody(response);

		expect(response.status).toBe(200);
		expect(html).toContain("[user:");
	});

	it("FlareState contains params for parameterized route", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/users/42"), {});
		const html = await readResponseBody(response);
		const state = extractFlareState(html);

		expect(state?.r).toEqual({ id: "42" });
	});

	it("different param values produce different FlareState", async () => {
		const handler = buildHandler();
		const r1 = await handler.fetch(makeRequest("/users/1"), {});
		const r2 = await handler.fetch(makeRequest("/users/999"), {});
		const s1 = extractFlareState(await readResponseBody(r1));
		const s2 = extractFlareState(await readResponseBody(r2));

		expect(s1?.r).toEqual({ id: "1" });
		expect(s2?.r).toEqual({ id: "999" });
	});
});

describe("SSR — nested layouts", () => {
	it("/blog/post renders root layout + blog layout + post page", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/blog/post"), {});
		const html = await readResponseBody(response);

		expect(response.status).toBe(200);
		expect(html).toContain("[root-layout]");
		expect(html).toContain("[blog-layout]");
		expect(html).toContain("[post:post body]");
		expect(html).toContain("[/blog-layout]");
		expect(html).toContain("[/root-layout]");
	});

	it("nesting order: root > blog > post", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/blog/post"), {});
		const html = await readResponseBody(response);

		const rootStart = html.indexOf("[root-layout]");
		const blogStart = html.indexOf("[blog-layout]");
		const postContent = html.indexOf("[post:post body]");
		const blogEnd = html.indexOf("[/blog-layout]");
		const rootEnd = html.indexOf("[/root-layout]");
		expect(rootStart).toBeLessThan(blogStart);
		expect(blogStart).toBeLessThan(postContent);
		expect(postContent).toBeLessThan(blogEnd);
		expect(blogEnd).toBeLessThan(rootEnd);
	});

	it("FlareState has 3 matches for nested route", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/blog/post"), {});
		const html = await readResponseBody(response);
		const state = extractFlareState(html);

		/* root layout + blog layout + post page */
		expect(state?.m.length).toBe(3);
	});

	it("blog post head config propagates", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/blog/post"), {});
		const html = await readResponseBody(response);
		const state = extractFlareState(html);

		const postHead = state?.ph?.find((h) => h.matchId.includes("_root_/(blog)/post"));
		expect(postHead).toBeDefined();
		expect((postHead?.head as Record<string, unknown>)?.title).toBe("Blog Post");
	});
});

describe("SSR — preloader context", () => {
	it("preloader result flows into loader", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/preloader-test"), {});
		const html = await readResponseBody(response);

		expect(response.status).toBe(200);
		expect(html).toContain("[preloader:pg://localhost]");
	});
});

describe("SSR — custom response headers", () => {
	it("route headers() merged into response", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/with-headers"), {});

		expect(response.status).toBe(200);
		expect(response.headers.get("X-Custom")).toBe("test-value");
	});
});

describe("SSR — security headers", () => {
	it("all security headers present on SSR response", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/home"), {});

		expect(response.headers.get("X-Frame-Options")).toBe("DENY");
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
		/* HSTS and COOP are skipped in dev mode by buildSecurityHeaders */
		expect(response.headers.get("Strict-Transport-Security")).toBeNull();
		expect(response.headers.get("Cross-Origin-Opener-Policy")).toBeNull();
	});

	it("CSP header with nonce on SSR response", async () => {
		devRef.current = false;
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/home"), {});
		const csp = response.headers.get("Content-Security-Policy") ?? "";

		expect(csp).toMatch(/nonce-[a-f0-9]+/);
		expect(csp).toContain("script-src");
	});

	it("dev mode CSP includes unsafe-eval", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/home"), {});
		const csp = response.headers.get("Content-Security-Policy") ?? "";

		expect(csp).toContain("unsafe-eval");
		expect(csp).toContain("ws://localhost:*");
	});
});

describe("SSR — redirect", () => {
	it("/old → 303 redirect to /about", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/old"), {});

		expect(response.status).toBe(303);
		expect(response.headers.get("Location")).toBe("/about");
	});

	it("redirect response has no body", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/old"), {});
		const body = await readResponseBody(response);

		expect(body).toBe("");
	});
});

describe("SSR — authentication", () => {
	it("/dashboard without authenticateFn → 401", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/dashboard"), {});

		expect(response.status).toBe(401);
		const html = await readResponseBody(response);
		expect(html).toContain("401");
		expect(html).toContain("Unauthorized");
	});

	it("/dashboard with null-returning auth → 401", async () => {
		const handler = buildHandler({ authenticateFn: neverAuthFn });
		const response = await handler.fetch(makeRequest("/dashboard"), {});

		expect(response.status).toBe(401);
	});

	it("/dashboard with valid auth → 200 with rendered content", async () => {
		const handler = buildHandler({ authenticateFn: alwaysAuthFn });
		const response = await handler.fetch(makeRequest("/dashboard"), {});

		expect(response.status).toBe(200);
		const html = await readResponseBody(response);
		expect(html).toContain("[dashboard:");
		expect(html).toContain('"id":"user-1"');
	});

	it("/dashboard auth data appears in FlareState", async () => {
		const handler = buildHandler({ authenticateFn: alwaysAuthFn });
		const response = await handler.fetch(makeRequest("/dashboard"), {});
		const html = await readResponseBody(response);
		const state = extractFlareState(html);

		const dashMatch = state?.m.find((m) => m.v === "_root_/dashboard");
		expect(dashMatch).toBeDefined();
		const data = dashMatch?.d as Record<string, unknown>;
		expect(data.user).toEqual({ id: "user-1", role: "admin" });
	});

	it("non-auth route works without authenticateFn", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/home"), {});

		expect(response.status).toBe(200);
	});
});

describe("SSR — broken loader", () => {
	it("/broken → 500 error page", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/broken"), {});

		/* loader throws → match.error set → deriveStatus returns 500 */
		expect(response.status).toBe(500);
	});

	it("/broken dev mode FlareState strips error stacks from serialized output", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/broken"), {});
		const html = await readResponseBody(response);
		const state = extractFlareState(html);

		if (state?.e) {
			/* stacks and messages stripped, only name+source preserved for hydration boundary matching */
			for (const entry of state.e) {
				expect(entry.stack).toBeUndefined();
				expect(entry.message).toBeUndefined();
				expect(entry.name).toBeDefined();
				expect(entry.source).toBeDefined();
			}
		}
	});
});

describe("SSR — 404 for unknown route", () => {
	it("unknown route → 404 with fallback HTML", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/nonexistent"), {});

		expect(response.status).toBe(404);
		const html = await readResponseBody(response);
		expect(html).toContain("Not Found");
	});

	it("404 still has security headers", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/nonexistent"), {});

		expect(response.headers.get("X-Frame-Options")).toBe("DENY");
		expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
	});
});

describe("SSR — URL normalization", () => {
	it("trailing slash → 301 redirect", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/about/"), {});

		expect(response.status).toBe(301);
		expect(response.headers.get("Location")).toBe("/about");
	});

	it("static file extension → 404 (not routed)", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/style.css"), {});

		expect(response.status).toBe(404);
	});
});

describe("SSR — entry script injection", () => {
	it("client entry script appears in HTML body", async () => {
		const handler = buildHandler({});
		const response = await handler.fetch(makeRequest("/home"), {});
		const html = await readResponseBody(response);

		/* virtual:flare-client-entry mock returns /src/client.tsx */
		expect(html).toContain("/src/client.tsx");
		expect(html).toContain('type="module"');
	});
});

describe("SSR — no console errors or warnings", () => {
	it("SSR render produces no console.error", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const handler = buildHandler();
		await handler.fetch(makeRequest("/home"), {});
		await handler.fetch(makeRequest("/about"), {});
		await handler.fetch(makeRequest("/users/1"), {});
		await handler.fetch(makeRequest("/blog/post"), {});

		expect(errorSpy).not.toHaveBeenCalled();
		errorSpy.mockRestore();
	});

	it("SSR render produces no unexpected console.warn", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const handler = buildHandler();
		await handler.fetch(makeRequest("/home"), {});
		await handler.fetch(makeRequest("/about"), {});
		await handler.fetch(makeRequest("/users/1"), {});

		/* Solid emits "computations created outside createRoot" in test env — expected */
		const unexpected = warnSpy.mock.calls.filter((args) => !String(args[0]).includes("computations created outside"));
		expect(unexpected).toEqual([]);
		warnSpy.mockRestore();
	});
});

describe("SSR — multiple sequential requests", () => {
	it("handler is reusable across requests with isolation", async () => {
		const handler = buildHandler();

		const r1 = await handler.fetch(makeRequest("/home"), {});
		const r2 = await handler.fetch(makeRequest("/about"), {});
		const r3 = await handler.fetch(makeRequest("/users/7"), {});

		expect(r1.status).toBe(200);
		expect(r2.status).toBe(200);
		expect(r3.status).toBe(200);

		const h1 = await readResponseBody(r1);
		const h2 = await readResponseBody(r2);
		const h3 = await readResponseBody(r3);

		expect(h1).toContain("[home]");
		expect(h1).not.toContain("[about:");
		expect(h2).toContain("[about:About]");
		expect(h2).not.toContain("[home]");
		expect(h3).toContain("[user:");

		/* FlareState pathnames are correct per request */
		expect(extractFlareState(h1)?.p).toBe("/home");
		expect(extractFlareState(h2)?.p).toBe("/about");
		expect(extractFlareState(h3)?.p).toBe("/users/7");
	});

	it("each request gets a unique nonce", async () => {
		devRef.current = false;
		const handler = buildHandler();
		const r1 = await handler.fetch(makeRequest("/home"), {});
		const r2 = await handler.fetch(makeRequest("/home"), {});

		const csp1 = r1.headers.get("Content-Security-Policy") ?? "";
		const csp2 = r2.headers.get("Content-Security-Policy") ?? "";
		const nonce1 = csp1.match(/nonce-([a-f0-9]+)/)?.[1];
		const nonce2 = csp2.match(/nonce-([a-f0-9]+)/)?.[1];

		expect(nonce1).toBeTruthy();
		expect(nonce2).toBeTruthy();
		expect(nonce1).not.toBe(nonce2);
	});
});
