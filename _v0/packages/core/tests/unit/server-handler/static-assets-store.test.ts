/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import TEST_BUILD_ID from "virtual:flare-build";
import { createRouter, type MarkedRouterConfig } from "../../../src/router-config/index.ts";
import type { RouteData, TreeNode } from "../../../src/router-primitives/index.ts";
import { createTreeNode, insertRoute } from "../../../src/router-primitives/index.ts";
import type { RouteMetaStatic } from "../../../src/router-primitives/types.ts";
import {
	createServerHandler,
	type HandlerCacheConfig,
	type ServerHandlerConfig,
} from "../../../src/server-handler/index.ts";
import { createAssetsStore } from "../../../src/store/assets.ts";
import {
	type FlareStore,
	type FlareStoreEntry,
	type StaticEntryData,
	staticStoreKey,
} from "../../../src/store/index.ts";

/* Production handler: no dev filesystem store, real warnings. */
vi.mock("virtual:flare-is-dev", () => ({ default: false }));

vi.mock("../../../src/ssr/index.tsx", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../../src/ssr/index.tsx")>();
	return {
		...actual,
		renderToStream: () => ({
			body: new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("<html><body>fresh render</body></html>"));
					controller.close();
				},
			}),
			headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
			status: 200,
		}),
	};
});

/* ── Helpers ──────────────────────────────────────────────────────────── */

function makeStore(
	entries: Record<string, FlareStoreEntry> = {},
): FlareStore & { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } {
	const map = new Map(Object.entries(entries));
	return {
		delete: vi.fn(async (key: string) => {
			map.delete(key);
		}),
		deleteByTags: vi.fn(async () => {}),
		get: vi.fn(async (key: string) => map.get(key) ?? null),
		set: vi.fn(async (key: string, entry: FlareStoreEntry) => {
			map.set(key, entry);
		}),
	};
}

function makeStaticEntry(
	overrides?: Partial<StaticEntryData> & { storedAt?: number; tags?: string[] },
): FlareStoreEntry {
	return {
		data: {
			headers: { "content-type": "text/html; charset=utf-8" },
			html: "<html><body>cached</body></html>",
			ndjson: '{"t":"d","k":"_root_/about","d":{"title":"cached"}}\n',
			...overrides,
		},
		storedAt: overrides?.storedAt ?? Date.now(),
		tags: overrides?.tags,
	};
}

function makeRouteData(overrides?: Partial<RouteData>): RouteData {
	return {
		e: "/about",
		o: {},
		p: () =>
			Promise.resolve({
				default: {
					loader: () => Promise.resolve({ title: "About" }),
					render: () => "about page",
					variablePath: "_root_/about",
					virtualPath: "_root_/about",
				},
			}),
		t: "r" as const,
		v: "_root_/about",
		x: "_root_/about",
		...overrides,
	};
}

function makeISRRouteData(staticMeta: RouteMetaStatic, path = "/about", overrides?: Partial<RouteData>): RouteData {
	const vPath = `_root_${path}`;
	return makeRouteData({
		e: path,
		o: { static: staticMeta },
		v: vPath,
		x: vPath,
		...overrides,
	});
}

function makeTreeWithRoute(path: string, routeData: RouteData): TreeNode {
	const tree = createTreeNode();
	insertRoute(tree, path, routeData);
	return tree;
}

function makeRouter(overrides?: Partial<MarkedRouterConfig>): MarkedRouterConfig {
	return createRouter({
		layouts: {},
		routeTree: createTreeNode(),
		...overrides,
	});
}

function makeHandler(
	routePath: string,
	routeData: RouteData,
	cache?: HandlerCacheConfig,
	extra?: Partial<ServerHandlerConfig>,
): ReturnType<typeof createServerHandler> {
	const tree = makeTreeWithRoute(routePath, routeData);
	const router = makeRouter({ layouts: {}, routeTree: tree });
	return createServerHandler({ cache, router, ...extra });
}

function req(url = "http://localhost/about", headers?: Record<string, string>): Request {
	return new Request(url, { headers });
}

/* ── Prerendered artifacts shipped with the build ───────────────────── */

const BASE = "/assets/_flare-static";

function artifacts(pathname: string, html: string) {
	const file = pathname === "/" ? "/index" : pathname;
	const files: Record<string, string> = {
		[`${BASE}/${TEST_BUILD_ID}${file}.json`]: JSON.stringify({
			headers: {
				"content-security-policy": "script-src 'nonce-__FLARE_NONCE__'",
				"content-type": "text/html; charset=utf-8",
			},
			html,
			ndjson: '{"t":"d"}\n',
		}),
	};
	const fetchAsset = vi.fn(async (path: string) =>
		path in files ? new Response(files[path]) : new Response(null, { status: 404 }),
	);
	return { fetchAsset, store: createAssetsStore(fetchAsset, { base: BASE }) };
}

describe("SSG served from build artifacts (cache.static)", () => {
	it("serves the prerendered page with a fresh nonce per request", async () => {
		const { store } = artifacts("/about", '<html><script nonce="__FLARE_NONCE__">x</script>SHIPPED</html>');
		const handler = makeHandler("/about", makeISRRouteData({ mode: "static" }), { static: store });

		const a = await handler.fetch(req(), {});
		const b = await handler.fetch(req(), {});
		const htmlA = await a.text();
		const htmlB = await b.text();

		expect(a.headers.get("flare-render")).toBe("SSG");
		expect(htmlA).toContain("SHIPPED");
		const nonceA = /nonce="([^"]+)"/.exec(htmlA)?.[1];
		const nonceB = /nonce="([^"]+)"/.exec(htmlB)?.[1];
		expect(nonceA).toBeTruthy();
		expect(nonceA).not.toBe("__FLARE_NONCE__");
		expect(nonceA).not.toBe(nonceB);
		expect(a.headers.get("content-security-policy")).toContain(`nonce-${nonceA}`);
	});

	it("serves the data request for an SSG page from the artifact", async () => {
		const { store } = artifacts("/about", "<html>SHIPPED</html>");
		const handler = makeHandler("/about", makeISRRouteData({ mode: "static" }), { static: store });

		const response = await handler.fetch(req("http://localhost/about", { "flare-data": "1" }), {});

		expect(response.headers.get("content-type")).toContain("ndjson");
		expect(await response.text()).toBe('{"t":"d"}\n');
	});

	it("ISR: a fresh ISR store entry wins over the build artifact", async () => {
		const { store: staticStore } = artifacts("/about", "<html>SHIPPED</html>");
		const isrStore = makeStore({
			[staticStoreKey(TEST_BUILD_ID, "/about")]: makeStaticEntry({ html: "<html>REVALIDATED</html>" }),
		});
		const handler = makeHandler("/about", makeISRRouteData({ mode: "isr", revalidate: 300 }), {
			static: staticStore,
			store: isrStore,
		});

		expect(await (await handler.fetch(req(), {})).text()).toContain("REVALIDATED");
	});

	it("ISR: on an ISR store miss the build artifact is served and refreshed into the ISR store", async () => {
		const { store: staticStore } = artifacts("/about", "<html>SHIPPED</html>");
		const isrStore = makeStore();
		const background: Promise<unknown>[] = [];
		const handler = makeHandler(
			"/about",
			makeISRRouteData({ mode: "isr", revalidate: 300 }),
			{ static: staticStore, store: isrStore },
			{ waitUntil: (p: Promise<unknown>) => void background.push(p) },
		);

		const response = await handler.fetch(req(), {});
		const body = await response.text();
		await Promise.allSettled(background);

		expect(body).toContain("SHIPPED");
		expect(response.headers.get("flare-cache")).toBe("STALE");
		expect(isrStore.set.mock.calls.map((c) => c[0])).toContain(staticStoreKey(TEST_BUILD_ID, "/about"));
	});

	it("an artifact store never receives writes (ISR revalidation goes to the ISR store only)", async () => {
		const { store: staticStore } = artifacts("/about", "<html>SHIPPED</html>");
		const background: Promise<unknown>[] = [];
		const handler = makeHandler(
			"/about",
			makeISRRouteData({ mode: "isr", revalidate: 300 }),
			{ static: staticStore },
			{ waitUntil: (p: Promise<unknown>) => void background.push(p) },
		);
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});

		const response = await handler.fetch(req(), {});
		await response.text();
		await Promise.allSettled(background);

		expect(errors.mock.calls.flat().join(" ")).not.toMatch(/read-only/);
		errors.mockRestore();
	});
});

describe("SSG without a static reader", () => {
	it("renders the page, warns once, and makes no outbound fetch", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const handler = makeHandler("/about", makeISRRouteData({ mode: "static" }), {});

		const a = await handler.fetch(req(), {});
		const b = await handler.fetch(req(), {});

		expect(await a.text()).toContain("fresh render");
		await b.text();
		const ssgWarnings = warn.mock.calls.filter((c) => c.join(" ").includes("cache.static"));
		expect(ssgWarnings).toHaveLength(1);
		expect(fetchSpy).not.toHaveBeenCalled();
		warn.mockRestore();
		fetchSpy.mockRestore();
	});
});
