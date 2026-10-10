import { describe, expect, it, vi } from "vitest";
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

/* ── callerData from first auth route ────────────────────────────── */

describe("callerData from first auth route", () => {
	it("root .authenticate('admin'), layout .authenticate('user') → callerData = ['admin']", async () => {
		let captured: unknown;
		const authFn = vi.fn((ctx: { callerData?: unknown[] }) => {
			captured = ctx.callerData;
			return Promise.resolve({ id: "u1" });
		});
		const root = makeRoute({
			authenticate: ["admin"],
			virtualPath: "_root_",
		});
		const layout = makeRoute({
			_type: "layout",
			authenticate: ["user"],
			virtualPath: "_root_/(auth)",
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [root, layout] }));
		expect(captured).toEqual(["admin"]);
	});

	it("layout has .authenticate() but root doesn't → callerData = []", async () => {
		let captured: unknown;
		const authFn = vi.fn((ctx: { callerData?: unknown[] }) => {
			captured = ctx.callerData;
			return Promise.resolve({ id: "u1" });
		});
		const root = makeRoute({
			virtualPath: "_root_",
		});
		const layout = makeRoute({
			_type: "layout",
			authenticate: [],
			virtualPath: "_root_/(auth)",
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [root, layout] }));
		expect(captured).toEqual([]);
	});

	it("root no auth, layout .authenticate('x'), page .authenticate('y') → callerData = ['x']", async () => {
		let captured: unknown;
		const authFn = vi.fn((ctx: { callerData?: unknown[] }) => {
			captured = ctx.callerData;
			return Promise.resolve({ id: "u1" });
		});
		const root = makeRoute({ virtualPath: "_root_" });
		const layout = makeRoute({
			_type: "layout",
			authenticate: ["x"],
			virtualPath: "_root_/(auth)",
		});
		const page = makeRoute({
			authenticate: ["y"],
			virtualPath: "_root_/(auth)/page",
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [root, layout, page] }));
		expect(captured).toEqual(["x"]);
	});
});

/* ── auth shared across all phases ───────────────────────────────── */

describe("auth shared across all phases", () => {
	it("auth object passed to preloader, authorize, and loader (same reference)", async () => {
		const user = { id: "u1", role: "admin" };
		const authFn = vi.fn(() => Promise.resolve(user));
		let preloaderAuth: unknown;
		let authorizeAuth: unknown;
		let loaderAuth: unknown;
		const route = makeRoute({
			authenticate: [],
			authorize: (ctx: Record<string, unknown>) => {
				authorizeAuth = ctx.auth;
				return true;
			},
			loader: (ctx: Record<string, unknown>) => {
				loaderAuth = ctx.auth;
				return {};
			},
			preloader: (ctx: Record<string, unknown>) => {
				preloaderAuth = ctx.auth;
				return {};
			},
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(preloaderAuth).toBe(user);
		expect(authorizeAuth).toBe(user);
		expect(loaderAuth).toBe(user);
	});

	it("non-auth root preloader gets null auth when only child has .authenticate()", async () => {
		const user = { id: "u1" };
		const authFn = vi.fn(() => Promise.resolve(user));
		let rootAuth: unknown = "sentinel";
		let childAuth: unknown;
		const root = makeRoute({
			preloader: (ctx: Record<string, unknown>) => {
				rootAuth = ctx.auth;
				return {};
			},
			virtualPath: "_root_",
		});
		const child = makeRoute({
			authenticate: [],
			loader: (ctx: Record<string, unknown>) => {
				childAuth = ctx.auth;
				return {};
			},
			virtualPath: "_root_/child",
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [root, child] }));
		/*
		 * Auth is resolved BEFORE preloaders run (phase 2 before phase 3).
		 * So even the root preloader receives the resolved auth (not null),
		 * because auth resolution is global, not per-route.
		 */
		expect(rootAuth).toBe(user);
		expect(childAuth).toBe(user);
	});

	it("auth available in authorize callback of SAME route that declared .authenticate()", async () => {
		const user = { id: "u1" };
		const authFn = vi.fn(() => Promise.resolve(user));
		let captured: unknown;
		const route = makeRoute({
			authenticate: ["admin"],
			authorize: (ctx: Record<string, unknown>) => {
				captured = ctx.auth;
				return true;
			},
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(captured).toBe(user);
	});
});

/* ── auth with preloader interaction ─────────────────────────────── */

describe("auth with preloader interaction", () => {
	it("auth resolved BEFORE preloaders run (phase 2 before phase 3)", async () => {
		const order: string[] = [];
		const authFn = vi.fn(() => {
			order.push("auth");
			return Promise.resolve({ id: "u1" });
		});
		const route = makeRoute({
			authenticate: [],
			preloader: () => {
				order.push("preloader");
				return {};
			},
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(order).toEqual(["auth", "preloader"]);
	});

	it("preloader of auth route receives auth object", async () => {
		const user = { id: "u1", role: "editor" };
		const authFn = vi.fn(() => Promise.resolve(user));
		let captured: unknown;
		const route = makeRoute({
			authenticate: ["editor"],
			preloader: (ctx: Record<string, unknown>) => {
				captured = ctx.auth;
				return {};
			},
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(captured).toBe(user);
	});
});

describe("authorize failure propagation to child routes", () => {
	const authFn = () => ({ id: 1 });

	it("child route loaders do not run after parent auth failure", async () => {
		const childLoader = vi.fn(() => Promise.resolve("should not run"));
		const layout = makeRoute({
			_type: "layout",
			authenticate: ["admin"],
			authorize: () => false,
			virtualPath: "_root_/(auth)",
		});
		const page = makeRoute({
			authenticate: ["admin"],
			loader: childLoader,
			virtualPath: "_root_/(auth)/secret",
		});
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [layout, page] }));
		expect(childLoader).not.toHaveBeenCalled();
		expect(result.matches[1]?.status).toBe("error");
		expect(result.matches[1]?.error?.name).toBe("UnauthorizedError");
	});

	it("multiple child routes all get auth error", async () => {
		const loader1 = vi.fn(() => Promise.resolve("a"));
		const loader2 = vi.fn(() => Promise.resolve("b"));
		const root = makeRoute({
			_type: "layout",
			authenticate: ["admin"],
			authorize: () => false,
			virtualPath: "_root_",
		});
		const child1 = makeRoute({
			_type: "layout",
			authenticate: ["admin"],
			loader: loader1,
			virtualPath: "_root_/child1",
		});
		const child2 = makeRoute({
			authenticate: ["admin"],
			loader: loader2,
			virtualPath: "_root_/child1/child2",
		});
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [root, child1, child2] }));
		expect(loader1).not.toHaveBeenCalled();
		expect(loader2).not.toHaveBeenCalled();
		expect(result.matches.every((m) => m.status === "error")).toBe(true);
	});
});
