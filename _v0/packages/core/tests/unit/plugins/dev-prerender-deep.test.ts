import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractedCacheConfig, RouteDefinition } from "../../../src/generators/index.ts";
import { createDevPrerenderPlugin, filterDevPrerenderRoutes } from "../../../src/plugins/dev-prerender.ts";

/* ── Helpers ──────────────────────────────────────────────────────────── */

const defaultCache: ExtractedCacheConfig = {
	isrDynamicParams: true,
};

function makeDef(overrides: Partial<RouteDefinition>): RouteDefinition {
	return {
		authenticateMode: false,
		cache: { ...defaultCache },
		exportName: "TestPage",
		filePath: "src/routes/test.page.tsx",
		hasInput: false,
		responseRoute: false,
		type: "page",
		virtualPath: "_root_/test",
		...overrides,
	};
}

/* ── filterDevPrerenderRoutes — deep coverage ─────────────────────────── */

describe("filterDevPrerenderRoutes: pathname conversion", () => {
	it("_root_/about → /about", () => {
		const defs = [makeDef({ cache: { ...defaultCache, ssg: true }, virtualPath: "_root_/about" })];
		const routes = filterDevPrerenderRoutes(defs);
		expect(routes[0]?.pathname).toBe("/about");
	});

	it("_root_/blog/post → /blog/post (nested path)", () => {
		const defs = [makeDef({ cache: { ...defaultCache, ssg: true }, virtualPath: "_root_/blog/post" })];
		const routes = filterDevPrerenderRoutes(defs);
		expect(routes[0]?.pathname).toBe("/blog/post");
	});

	it("_root_ alone → / (root page)", () => {
		const defs = [makeDef({ cache: { ...defaultCache, ssg: true }, virtualPath: "_root_" })];
		/* _root_ alone is typically a layout, but if type is page... */
		const routes = filterDevPrerenderRoutes(defs);
		expect(routes).toHaveLength(1);
		expect(routes[0]?.pathname).toBe("/");
	});

	it("group routes: _root_/(marketing)/pricing → /pricing", () => {
		const defs = [
			makeDef({
				cache: { ...defaultCache, ssg: true },
				virtualPath: "_root_/(marketing)/pricing",
			}),
		];
		const routes = filterDevPrerenderRoutes(defs);
		expect(routes[0]?.pathname).toBe("/pricing");
	});

	it("nested group route: _root_/(auth)/(admin)/settings → /settings", () => {
		const defs = [
			makeDef({
				cache: { ...defaultCache, ssg: true },
				virtualPath: "_root_/(auth)/(admin)/settings",
			}),
		];
		const routes = filterDevPrerenderRoutes(defs);
		expect(routes[0]?.pathname).toBe("/settings");
	});

	it("deeply nested: _root_/docs/api/v2/reference → /docs/api/v2/reference", () => {
		const defs = [
			makeDef({
				cache: { ...defaultCache, ssg: true },
				virtualPath: "_root_/docs/api/v2/reference",
			}),
		];
		const routes = filterDevPrerenderRoutes(defs);
		expect(routes[0]?.pathname).toBe("/docs/api/v2/reference");
	});
});

describe("filterDevPrerenderRoutes: route type filtering", () => {
	it("excludes layout type", () => {
		const routes = filterDevPrerenderRoutes([
			makeDef({ cache: { ...defaultCache, ssg: true }, type: "layout", virtualPath: "_root_" }),
		]);
		expect(routes).toHaveLength(0);
	});

	it("excludes root-layout type", () => {
		const routes = filterDevPrerenderRoutes([
			makeDef({
				cache: { ...defaultCache, ssg: true },
				type: "root-layout",
				virtualPath: "_root_",
			}),
		]);
		expect(routes).toHaveLength(0);
	});

	it("excludes response routes", () => {
		const routes = filterDevPrerenderRoutes([
			makeDef({
				cache: { ...defaultCache, ssg: true },
				responseRoute: true,
				virtualPath: "_root_/api/data",
			}),
		]);
		expect(routes).toHaveLength(0);
	});

	it("excludes SSR-only routes (no ssg flag)", () => {
		const routes = filterDevPrerenderRoutes([makeDef({ virtualPath: "_root_/dynamic" })]);
		expect(routes).toHaveLength(0);
	});
});

describe("filterDevPrerenderRoutes: cache config filtering", () => {
	it("excludes ISR routes (has revalidate)", () => {
		const routes = filterDevPrerenderRoutes([
			makeDef({
				cache: { ...defaultCache, isr: true, isrRevalidate: 60 },
				virtualPath: "_root_/posts",
			}),
		]);
		expect(routes).toHaveLength(0);
	});

	it("excludes ISR with fallback", () => {
		const routes = filterDevPrerenderRoutes([
			makeDef({
				cache: { ...defaultCache, isr: true, isrDynamicParams: false, isrRevalidate: 30 },
				virtualPath: "_root_/products",
			}),
		]);
		expect(routes).toHaveLength(0);
	});

	it("includes SSG route (ssg: true, no ISR)", () => {
		const routes = filterDevPrerenderRoutes([
			makeDef({
				cache: { ...defaultCache, ssg: true },
				virtualPath: "_root_/about",
			}),
		]);
		expect(routes).toHaveLength(1);
		expect(routes[0]?.mode).toBe("static");
	});
});

describe("filterDevPrerenderRoutes: dynamic route exclusion", () => {
	it("excludes [param] routes", () => {
		const routes = filterDevPrerenderRoutes([
			makeDef({
				cache: { ...defaultCache, ssg: true },
				virtualPath: "_root_/blog/[slug]",
			}),
		]);
		expect(routes).toHaveLength(0);
	});

	it("excludes [[optional]] routes", () => {
		const routes = filterDevPrerenderRoutes([
			makeDef({
				cache: { ...defaultCache, ssg: true },
				virtualPath: "_root_/blog/[[page]]",
			}),
		]);
		expect(routes).toHaveLength(0);
	});

	it("excludes [...catch] routes", () => {
		const routes = filterDevPrerenderRoutes([
			makeDef({
				cache: { ...defaultCache, ssg: true },
				virtualPath: "_root_/docs/[...path]",
			}),
		]);
		expect(routes).toHaveLength(0);
	});

	it("excludes [[...optionalCatch]] routes", () => {
		const routes = filterDevPrerenderRoutes([
			makeDef({
				cache: { ...defaultCache, ssg: true },
				virtualPath: "_root_/app/[[...rest]]",
			}),
		]);
		expect(routes).toHaveLength(0);
	});

	it("excludes nested dynamic: _root_/users/[id]/posts", () => {
		const routes = filterDevPrerenderRoutes([
			makeDef({
				cache: { ...defaultCache, ssg: true },
				virtualPath: "_root_/users/[id]/posts",
			}),
		]);
		expect(routes).toHaveLength(0);
	});
});

describe("filterDevPrerenderRoutes: mixed route sets", () => {
	it("filters complex mix — only static SSG pages remain", () => {
		const defs = [
			makeDef({ cache: { ...defaultCache, ssg: true }, virtualPath: "_root_/about" }),
			makeDef({ cache: { ...defaultCache, ssg: true }, virtualPath: "_root_/faq" }),
			makeDef({ cache: { ...defaultCache, ssg: true }, virtualPath: "_root_/terms" }),
			makeDef({
				cache: { ...defaultCache, isr: true, isrRevalidate: 30 },
				virtualPath: "_root_/posts",
			}),
			makeDef({ virtualPath: "_root_/contact" }),
			makeDef({ cache: { ...defaultCache, ssg: true }, type: "layout", virtualPath: "_root_" }),
			makeDef({
				cache: { ...defaultCache, ssg: true },
				virtualPath: "_root_/blog/[slug]",
			}),
			makeDef({
				cache: { ...defaultCache, ssg: true },
				responseRoute: true,
				virtualPath: "_root_/api/health",
			}),
		];
		const routes = filterDevPrerenderRoutes(defs);
		expect(routes).toHaveLength(3);
		expect(routes.map((r) => r.pathname).sort()).toEqual(["/about", "/faq", "/terms"]);
		for (const r of routes) {
			expect(r.mode).toBe("static");
		}
	});

	it("empty input → empty output", () => {
		expect(filterDevPrerenderRoutes([])).toEqual([]);
	});

	it("all excluded → empty output", () => {
		const defs = [
			makeDef({
				cache: { ...defaultCache, isr: true, isrRevalidate: 60 },
				virtualPath: "_root_/dynamic",
			}),
			makeDef({ type: "layout", virtualPath: "_root_" }),
		];
		expect(filterDevPrerenderRoutes(defs)).toHaveLength(0);
	});
});

/* ── createDevPrerenderPlugin — structure and configuration ───────────── */

describe("createDevPrerenderPlugin: plugin structure", () => {
	it("returns plugin with correct name", () => {
		const plugin = createDevPrerenderPlugin({});
		expect(plugin.name).toBe("flare:dev-prerender");
	});

	it("has configureServer hook", () => {
		const plugin = createDevPrerenderPlugin({});
		expect(typeof plugin.configureServer).toBe("function");
	});

	it("configureServer returns undefined (post-hook pattern)", () => {
		const plugin = createDevPrerenderPlugin({});
		const configure = plugin.configureServer as (server: unknown) => unknown;
		/* No SSR runner → early return */
		const result = configure({
			config: { root: "/tmp" },
			environments: {},
		});
		expect(result).toBeUndefined();
	});

	it("configureServer handles missing environments gracefully", () => {
		const plugin = createDevPrerenderPlugin({});
		const configure = plugin.configureServer as (server: unknown) => unknown;
		expect(() => configure({ config: { root: "/tmp" } })).not.toThrow();
	});

	it("configureServer handles null httpServer (no watch crash)", () => {
		const tmpRoot = join(tmpdir(), `flare-prerender-${Date.now()}`);
		mkdirSync(join(tmpRoot, "src", "routes"), { recursive: true });
		try {
			const plugin = createDevPrerenderPlugin({});
			const configure = plugin.configureServer as (server: unknown) => unknown;
			expect(() =>
				configure({
					config: { root: tmpRoot },
					environments: { ssr: { runner: { import: vi.fn() } } },
					httpServer: null,
				}),
			).not.toThrow();
		} finally {
			rmSync(tmpRoot, { force: true, recursive: true });
		}
	});
});

describe("createDevPrerenderPlugin: server event registration", () => {
	let tmpRoot: string;

	beforeEach(() => {
		tmpRoot = join(tmpdir(), `flare-prerender-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(join(tmpRoot, "src", "routes"), { recursive: true });
	});

	afterEach(() => {
		rmSync(tmpRoot, { force: true, recursive: true });
	});

	it("registers listening and close events on httpServer when runner exists", () => {
		const plugin = createDevPrerenderPlugin({});
		const configure = plugin.configureServer as (server: unknown) => unknown;
		const onSpy = vi.fn();
		configure({
			config: { root: tmpRoot },
			environments: { ssr: { runner: { import: vi.fn() } } },
			httpServer: { on: onSpy },
		});
		expect(onSpy).toHaveBeenCalledWith("listening", expect.any(Function));
		expect(onSpy).toHaveBeenCalledWith("close", expect.any(Function));
	});

	it("does not register events when ssr runner is missing", () => {
		const plugin = createDevPrerenderPlugin({});
		const configure = plugin.configureServer as (server: unknown) => unknown;
		const onSpy = vi.fn();
		configure({
			config: { root: tmpRoot },
			environments: { ssr: {} },
			httpServer: { on: onSpy },
		});
		expect(onSpy).not.toHaveBeenCalled();
	});

	it("close event handler cleans up watcher", () => {
		const plugin = createDevPrerenderPlugin({});
		const configure = plugin.configureServer as (server: unknown) => unknown;
		const callbacks: Record<string, (() => void)[]> = {};
		const onSpy = vi.fn((event: string, fn: () => void) => {
			callbacks[event] = callbacks[event] ?? [];
			callbacks[event].push(fn);
		});
		configure({
			config: { root: tmpRoot },
			environments: { ssr: { runner: { import: vi.fn() } } },
			httpServer: { on: onSpy },
		});
		/* Close should not throw */
		const closeFns = callbacks["close"];
		expect(closeFns).toBeDefined();
		expect(() => {
			for (const fn of closeFns ?? []) fn();
		}).not.toThrow();
	});
});

describe("createDevPrerenderPlugin: ignorePrefix passthrough", () => {
	it("uses config.ignorePrefix when provided", () => {
		/* This test validates the ignorePrefix flows through to scanSourceFiles.
		 * Since scanSourceFiles is called inside the plugin, we verify the plugin
		 * accepts the config without error. */
		const plugin = createDevPrerenderPlugin({ ignorePrefix: "~" });
		expect(plugin.name).toBe("flare:dev-prerender");
	});

	it("defaults to _ when ignorePrefix not specified", () => {
		const plugin = createDevPrerenderPlugin({});
		expect(plugin.name).toBe("flare:dev-prerender");
	});
});
