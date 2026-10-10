import { describe, expect, it } from "vitest";
import type { PipelineConfig, ResolvedRoute } from "../../../src/loader-pipeline/index.ts";
import { runPipeline } from "../../../src/loader-pipeline/index.ts";

function makeRoute(overrides?: Partial<ResolvedRoute>): ResolvedRoute {
	return {
		_type: "render",
		variablePath: "/",
		virtualPath: "_root_",
		...overrides,
	};
}

function makeConfig(overrides?: Partial<PipelineConfig>): PipelineConfig {
	return {
		abortController: new AbortController(),
		cause: "enter",
		env: {},
		prefetch: false,
		request: new Request("http://localhost/"),
		routes: [],
		url: new URL("http://localhost/"),
		...overrides,
	};
}

/* ── override semantics ──────────────────────────────────────────── */

describe("preloaderContext override semantics", () => {
	it("child preloader returning same key as parent → child value wins", async () => {
		let pageSnapshot: unknown;
		const root = makeRoute({
			preloader: () => ({ shared: "root" }),
			virtualPath: "_root_",
		});
		const page = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				pageSnapshot = ctx.preloaderContext;
				return {};
			},
			preloader: () => ({ shared: "page" }),
			virtualPath: "_root_/page",
		});
		await runPipeline(makeConfig({ routes: [root, page] }));
		expect(pageSnapshot).toEqual({ shared: "page" });
	});

	it("3-level chain: root {a:1} → layout {a:2, b:1} → page {b:2, c:1} → final {a:2, b:2, c:1}", async () => {
		let pageSnapshot: unknown;
		const root = makeRoute({
			preloader: () => ({ a: 1 }),
			virtualPath: "_root_",
		});
		const layout = makeRoute({
			_type: "layout",
			preloader: () => ({ a: 2, b: 1 }),
			virtualPath: "_root_/(group)",
		});
		const page = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				pageSnapshot = ctx.preloaderContext;
				return {};
			},
			preloader: () => ({ b: 2, c: 1 }),
			virtualPath: "_root_/(group)/page",
		});
		await runPipeline(makeConfig({ routes: [root, layout, page] }));
		expect(pageSnapshot).toEqual({ a: 2, b: 2, c: 1 });
	});

	it("each route snapshot is frozen at its point in time", async () => {
		let rootSnapshot: unknown;
		let layoutSnapshot: unknown;
		let pageSnapshot: unknown;
		const root = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				rootSnapshot = ctx.preloaderContext;
				return {};
			},
			preloader: () => ({ a: 1 }),
			virtualPath: "_root_",
		});
		const layout = makeRoute({
			_type: "layout",
			loader: (ctx: Record<string, unknown>) => {
				layoutSnapshot = ctx.preloaderContext;
				return {};
			},
			preloader: () => ({ a: 2, b: 1 }),
			virtualPath: "_root_/(group)",
		});
		const page = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				pageSnapshot = ctx.preloaderContext;
				return {};
			},
			preloader: () => ({ b: 2, c: 1 }),
			virtualPath: "_root_/(group)/page",
		});
		await runPipeline(makeConfig({ routes: [root, layout, page] }));
		expect(rootSnapshot).toEqual({ a: 1 });
		expect(layoutSnapshot).toEqual({ a: 2, b: 1 });
		expect(pageSnapshot).toEqual({ a: 2, b: 2, c: 1 });
	});

	it("authorize receives snapshot AFTER its own route's preloader", async () => {
		let authorizeSnapshot: unknown;
		const root = makeRoute({
			preloader: () => ({ fromRoot: true }),
			virtualPath: "_root_",
		});
		const layout = makeRoute({
			_type: "layout",
			authorize: (ctx: Record<string, unknown>) => {
				authorizeSnapshot = ctx.preloaderContext;
				return true;
			},
			preloader: () => ({ fromLayout: true }),
			virtualPath: "_root_/(auth)",
		});
		await runPipeline(makeConfig({ routes: [root, layout] }));
		expect(authorizeSnapshot).toEqual({ fromLayout: true, fromRoot: true });
	});
});

/* ── non-object returns ──────────────────────────────────────────── */

describe("preloader non-object returns", () => {
	it("null → context unchanged", async () => {
		let snapshot: unknown;
		const root = makeRoute({
			preloader: () => ({ initial: true }),
			virtualPath: "_root_",
		});
		const page = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				snapshot = ctx.preloaderContext;
				return {};
			},
			preloader: () => null,
			virtualPath: "_root_/page",
		});
		await runPipeline(makeConfig({ routes: [root, page] }));
		expect(snapshot).toEqual({ initial: true });
	});

	it("undefined → context unchanged", async () => {
		let snapshot: unknown;
		const root = makeRoute({
			preloader: () => ({ initial: true }),
			virtualPath: "_root_",
		});
		const page = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				snapshot = ctx.preloaderContext;
				return {};
			},
			preloader: () => undefined,
			virtualPath: "_root_/page",
		});
		await runPipeline(makeConfig({ routes: [root, page] }));
		expect(snapshot).toEqual({ initial: true });
	});

	it("falsy non-object (0, false, empty string) → context unchanged", async () => {
		let snapshotZero: unknown;
		let snapshotFalse: unknown;
		let snapshotEmpty: unknown;

		const rootZero = makeRoute({
			preloader: () => ({ x: 1 }),
			virtualPath: "_root_",
		});
		const pageZero = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				snapshotZero = ctx.preloaderContext;
				return {};
			},
			preloader: () => 0,
			virtualPath: "_root_/a",
		});
		await runPipeline(makeConfig({ routes: [rootZero, pageZero] }));
		expect(snapshotZero).toEqual({ x: 1 });

		const rootFalse = makeRoute({
			preloader: () => ({ x: 1 }),
			virtualPath: "_root_",
		});
		const pageFalse = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				snapshotFalse = ctx.preloaderContext;
				return {};
			},
			preloader: () => false,
			virtualPath: "_root_/b",
		});
		await runPipeline(makeConfig({ routes: [rootFalse, pageFalse] }));
		expect(snapshotFalse).toEqual({ x: 1 });

		const rootEmpty = makeRoute({
			preloader: () => ({ x: 1 }),
			virtualPath: "_root_",
		});
		const pageEmpty = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				snapshotEmpty = ctx.preloaderContext;
				return {};
			},
			preloader: () => "",
			virtualPath: "_root_/c",
		});
		await runPipeline(makeConfig({ routes: [rootEmpty, pageEmpty] }));
		expect(snapshotEmpty).toEqual({ x: 1 });
	});
});

/* ── 3-level accumulation ────────────────────────────────────────── */

describe("preloaderContext 3-level accumulation", () => {
	it("root → layout → page: each loader gets progressively more context", async () => {
		let rootLoaderCtx: unknown;
		let layoutLoaderCtx: unknown;
		let pageLoaderCtx: unknown;
		const root = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				rootLoaderCtx = ctx.preloaderContext;
				return {};
			},
			preloader: () => ({ root: true }),
			virtualPath: "_root_",
		});
		const layout = makeRoute({
			_type: "layout",
			loader: (ctx: Record<string, unknown>) => {
				layoutLoaderCtx = ctx.preloaderContext;
				return {};
			},
			preloader: () => ({ layout: true }),
			virtualPath: "_root_/(group)",
		});
		const page = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				pageLoaderCtx = ctx.preloaderContext;
				return {};
			},
			virtualPath: "_root_/(group)/page",
		});
		await runPipeline(makeConfig({ routes: [root, layout, page] }));
		expect(rootLoaderCtx).toEqual({ root: true });
		expect(layoutLoaderCtx).toEqual({ layout: true, root: true });
		expect(pageLoaderCtx).toEqual({ layout: true, root: true });
	});

	it("page loader gets full accumulated context from root + layout preloaders", async () => {
		let captured: unknown;
		const root = makeRoute({
			preloader: () => ({ db: "connected" }),
			virtualPath: "_root_",
		});
		const layout = makeRoute({
			_type: "layout",
			preloader: () => ({ user: "admin" }),
			virtualPath: "_root_/(auth)",
		});
		const page = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				captured = ctx.preloaderContext;
				return {};
			},
			virtualPath: "_root_/(auth)/dashboard",
		});
		await runPipeline(makeConfig({ routes: [root, layout, page] }));
		expect(captured).toEqual({ db: "connected", user: "admin" });
	});
});
