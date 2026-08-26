import { describe, expect, it, vi } from "vitest";
import {
	buildPrerenderRoutes,
	NONCE_PLACEHOLDER,
	prerender,
	writePrerenderOutput,
} from "../../../src/prerender/index.ts";

/* ── NONCE_PLACEHOLDER constant ── */

describe("NONCE_PLACEHOLDER", () => {
	it("is __FLARE_NONCE__", () => {
		expect(NONCE_PLACEHOLDER).toBe("__FLARE_NONCE__");
	});
});

/* ── prerender: extractNonce + replaceNonce (tested via integration) ── */

describe("prerender nonce replacement", () => {
	function mockHandler(html: string, ndjson = "", status = 200) {
		return {
			fetch: vi.fn(async (req: Request) => {
				const isData = req.headers.get("flare-data") === "1";
				if (isData) return new Response(ndjson, { status: 200 });
				return new Response(html, {
					headers: {
						"Content-Security-Policy": `script-src 'nonce-deadbeef1234567890abcdef12345678'`,
						"Content-Type": "text/html",
					},
					status,
				});
			}),
		};
	}

	it("replaces nonce in HTML and headers with placeholder", async () => {
		const nonce = "deadbeef1234567890abcdef12345678";
		const html = `<html><head><meta name="csp-nonce" nonce="${nonce}"><script nonce="${nonce}">self.flare={};</script></head><body></body></html>`;
		const handler = mockHandler(html);
		const result = await prerender({
			handler,
			origin: "http://localhost",
			routes: [{ mode: "static", pathname: "/" }],
		});
		expect(result.errors).toHaveLength(0);
		expect(result.entries).toHaveLength(1);
		const entry = result.entries[0];
		expect(entry?.html).not.toContain(nonce);
		expect(entry?.html).toContain(NONCE_PLACEHOLDER);
		expect(entry?.headers["content-security-policy"]).toContain(NONCE_PLACEHOLDER);
		expect(entry?.headers["content-security-policy"]).not.toContain(nonce);
	});

	it("no nonce in HTML → html stored as-is", async () => {
		const html = "<html><head></head><body>no nonce</body></html>";
		const handler = mockHandler(html);
		const result = await prerender({
			handler,
			origin: "http://localhost",
			routes: [{ mode: "static", pathname: "/" }],
		});
		expect(result.entries[0]?.html).toBe(html);
	});

	it("NDJSON fetch failure is non-fatal → stores empty ndjson", async () => {
		const handler = {
			fetch: vi.fn(async (req: Request) => {
				if (req.headers.get("flare-data") === "1") throw new Error("NDJSON fail");
				return new Response("<html></html>", { status: 200 });
			}),
		};
		const result = await prerender({
			handler,
			origin: "http://localhost",
			routes: [{ mode: "static", pathname: "/" }],
		});
		expect(result.errors).toHaveLength(0);
		expect(result.entries[0]?.ndjson).toBe("");
	});

	it("HTML fetch throws → error recorded", async () => {
		const handler = {
			fetch: vi.fn(async () => {
				throw new Error("Connection refused");
			}),
		};
		const result = await prerender({
			handler,
			origin: "http://localhost",
			routes: [{ mode: "static", pathname: "/broken" }],
		});
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.message).toBe("Connection refused");
		expect(result.errors[0]?.pathname).toBe("/broken");
	});

	it("non-200 HTML response → error recorded", async () => {
		const handler = mockHandler("", "", 500);
		const result = await prerender({
			handler,
			origin: "http://localhost",
			routes: [{ mode: "static", pathname: "/error-page" }],
		});
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.message).toContain("500");
	});
});

/* ── prerender concurrency + exclusion ── */

describe("prerender concurrency and exclusion", () => {
	it("exclude filters out specified routes", async () => {
		const handler = {
			fetch: vi.fn(async () => new Response("<html></html>", { status: 200 })),
		};
		const result = await prerender({
			exclude: ["/secret"],
			handler,
			origin: "http://localhost",
			routes: [
				{ mode: "static", pathname: "/" },
				{ mode: "static", pathname: "/secret" },
				{ mode: "static", pathname: "/public" },
			],
		});
		expect(result.entries).toHaveLength(2);
		expect(handler.fetch).toHaveBeenCalledTimes(4); /* 2 routes × 2 (HTML + NDJSON) */
	});

	it("empty routes → returns empty result", async () => {
		const handler = { fetch: vi.fn() };
		const result = await prerender({
			handler,
			origin: "http://localhost",
			routes: [],
		});
		expect(result.entries).toHaveLength(0);
		expect(result.errors).toHaveLength(0);
		expect(handler.fetch).not.toHaveBeenCalled();
	});

	it("env as function → resolved before rendering", async () => {
		const envFactory = vi.fn(async () => ({ DB: "test" }));
		const handler = {
			fetch: vi.fn(async (_req: Request, env: unknown) => {
				expect(env).toEqual({ DB: "test" });
				return new Response("<html></html>", { status: 200 });
			}),
		};
		const result = await prerender({
			env: envFactory,
			handler,
			origin: "http://localhost",
			routes: [{ mode: "static", pathname: "/" }],
		});
		expect(envFactory).toHaveBeenCalledTimes(1);
		expect(result.entries).toHaveLength(1);
	});

	it("env as object → passed directly", async () => {
		const handler = {
			fetch: vi.fn(async (_req: Request, env: unknown) => {
				expect(env).toEqual({ SECRET: "abc" });
				return new Response("<html></html>", { status: 200 });
			}),
		};
		await prerender({
			env: { SECRET: "abc" },
			handler,
			origin: "http://localhost",
			routes: [{ mode: "static", pathname: "/" }],
		});
	});

	it("route properties (defer, dynamicParams, revalidate, tags) preserved in entry", async () => {
		const handler = {
			fetch: vi.fn(async () => new Response("<html></html>", { status: 200 })),
		};
		const result = await prerender({
			handler,
			origin: "http://localhost",
			routes: [
				{
					defer: "resolve",
					dynamicParams: false,
					mode: "isr",
					pathname: "/page",
					revalidate: 60,
					tags: ["page"],
				},
			],
		});
		const entry = result.entries[0];
		expect(entry?.defer).toBe("resolve");
		expect(entry?.dynamicParams).toBe(false);
		expect(entry?.revalidate).toBe(60);
		expect(entry?.tags).toEqual(["page"]);
	});
});

/* ── buildPrerenderRoutes ── */

describe("buildPrerenderRoutes deep", () => {
	function makeDef(overrides: Record<string, unknown> = {}) {
		return {
			authenticateMode: undefined,
			cache: { ssg: true },
			type: "page",
			virtualPath: "_root_/about",
			...overrides,
		};
	}

	it("filters non-page types", () => {
		const routes = buildPrerenderRoutes([makeDef({ type: "layout" }), makeDef({ type: "page" })] as never);
		expect(routes).toHaveLength(1);
	});

	it("filters response routes", () => {
		const routes = buildPrerenderRoutes([makeDef({ responseRoute: true })] as never);
		expect(routes).toHaveLength(0);
	});

	it("filters routes without ssg/isr config", () => {
		const routes = buildPrerenderRoutes([makeDef({ cache: {} })] as never);
		expect(routes).toHaveLength(0);
	});

	it("throws on authenticate + ssg", () => {
		expect(() => buildPrerenderRoutes([makeDef({ authenticateMode: true })] as never)).toThrow(
			"authenticate and static",
		);
	});

	it("throws on authenticate + isr", () => {
		expect(() =>
			buildPrerenderRoutes([makeDef({ authenticateMode: true, cache: { isr: true, isrRevalidate: 60 } })] as never),
		).toThrow("authenticate and static");
	});

	it("throws on authenticate + on-demand isr (no revalidate)", () => {
		expect(() => buildPrerenderRoutes([makeDef({ authenticateMode: true, cache: { isr: true } })] as never)).toThrow(
			"authenticate and static",
		);
	});

	it("authenticateOptional allowed with ssg", () => {
		const routes = buildPrerenderRoutes([makeDef({ authenticateMode: "optional" })] as never);
		expect(routes).toHaveLength(1);
	});

	it("ssg → mode static", () => {
		const routes = buildPrerenderRoutes([makeDef()] as never);
		expect(routes[0]?.mode).toBe("static");
	});

	it("isr with revalidate → mode isr", () => {
		const routes = buildPrerenderRoutes([makeDef({ cache: { isr: true, isrRevalidate: 60 } })] as never);
		expect(routes[0]?.mode).toBe("isr");
	});

	it("isr: true without revalidate → skipped (on-demand only)", () => {
		const routes = buildPrerenderRoutes([makeDef({ cache: { isr: true } })] as never);
		expect(routes).toHaveLength(0);
	});

	it("isr dynamic without revalidate → skipped (on-demand only)", () => {
		const routes = buildPrerenderRoutes([makeDef({ cache: { isr: "dynamic" } })] as never);
		expect(routes).toHaveLength(0);
	});

	it("isr dynamic with revalidate → mode isr", () => {
		const routes = buildPrerenderRoutes([makeDef({ cache: { isr: "dynamic", isrRevalidate: 300 } })] as never);
		expect(routes[0]?.mode).toBe("isr");
	});

	it("virtualPath _root_/about → pathname /about", () => {
		const routes = buildPrerenderRoutes([makeDef()] as never);
		expect(routes[0]?.pathname).toBe("/about");
	});

	it("virtualPath _root_/ → pathname /", () => {
		const routes = buildPrerenderRoutes([makeDef({ virtualPath: "_root_/" })] as never);
		expect(routes[0]?.pathname).toBe("/");
	});

	it("virtualPath with group segment stripped", () => {
		const routes = buildPrerenderRoutes([makeDef({ virtualPath: "_root_/(marketing)/pricing" })] as never);
		expect(routes[0]?.pathname).toBe("/pricing");
	});

	it("isrRevalidate preserved", () => {
		const routes = buildPrerenderRoutes([makeDef({ cache: { isr: true, isrRevalidate: 300 } })] as never);
		expect(routes[0]?.revalidate).toBe(300);
	});

	it("ssgDefer preserved", () => {
		const routes = buildPrerenderRoutes([makeDef({ cache: { ssg: true, ssgDefer: "stream" } })] as never);
		expect(routes[0]?.defer).toBe("stream");
	});

	it("isrDefer preserved", () => {
		const routes = buildPrerenderRoutes([
			makeDef({ cache: { isr: true, isrDefer: "resolve", isrRevalidate: 60 } }),
		] as never);
		expect(routes[0]?.defer).toBe("resolve");
	});

	it("isrDynamicParams preserved", () => {
		const routes = buildPrerenderRoutes([
			makeDef({ cache: { isr: "dynamic", isrDynamicParams: false, isrRevalidate: 60 } }),
		] as never);
		expect(routes[0]?.dynamicParams).toBe(false);
	});

	it("isrDynamicParams true preserved", () => {
		const routes = buildPrerenderRoutes([
			makeDef({ cache: { isr: "dynamic", isrDynamicParams: true, isrRevalidate: 60 } }),
		] as never);
		expect(routes[0]?.dynamicParams).toBe(true);
	});

	it("cdnTags copied onto static prerender route", () => {
		const routes = buildPrerenderRoutes([makeDef({ cache: { cdnTags: ["about"], ssg: true } })] as never);
		expect(routes[0]?.tags).toEqual(["about"]);
	});
});

/* ── writePrerenderOutput ── */

describe("writePrerenderOutput deep", () => {
	it("root pathname / → files at /index.*", () => {
		const output = writePrerenderOutput([
			{
				headers: {},
				html: "<html/>",
				mode: "static",
				ndjson: "{}",
				pathname: "/",
			},
		]);
		const paths = output.files.map((f) => f.path);
		expect(paths).toContain("/index.html");
		expect(paths).toContain("/index.ndjson");
		expect(paths).toContain("/index.headers.json");
	});

	it("nested pathname → files at nested path", () => {
		const output = writePrerenderOutput([
			{
				headers: {},
				html: "<html/>",
				mode: "static",
				ndjson: "",
				pathname: "/blog/post",
			},
		]);
		expect(output.files.map((f) => f.path)).toContain("/blog/post.html");
	});

	it("headers serialized as JSON", () => {
		const output = writePrerenderOutput([
			{
				headers: { "content-type": "text/html", "x-custom": "value" },
				html: "",
				mode: "static",
				ndjson: "",
				pathname: "/test",
			},
		]);
		const headersFile = output.files.find((f) => f.path.endsWith(".headers.json"));
		const parsed = JSON.parse(headersFile?.content ?? "{}");
		expect(parsed["content-type"]).toBe("text/html");
		expect(parsed["x-custom"]).toBe("value");
	});

	it("optional fields only present when defined", () => {
		const output = writePrerenderOutput([
			{
				headers: {},
				html: "",
				mode: "static",
				ndjson: "",
				pathname: "/plain",
			},
		]);
		const record = output.manifest[0];
		expect(record?.defer).toBeUndefined();
		expect(record?.dynamicParams).toBeUndefined();
		expect(record?.revalidate).toBeUndefined();
		expect(record?.tags).toBeUndefined();
	});

	it("all optional fields preserved when set", () => {
		const output = writePrerenderOutput([
			{
				defer: "resolve" as const,
				dynamicParams: false,
				headers: {},
				html: "",
				mode: "isr",
				ndjson: "",
				pathname: "/full",
				revalidate: 60,
				tags: ["blog"],
			},
		]);
		const record = output.manifest[0];
		expect(record?.defer).toBe("resolve");
		expect(record?.dynamicParams).toBe(false);
		expect(record?.revalidate).toBe(60);
		expect(record?.tags).toEqual(["blog"]);
	});
});
