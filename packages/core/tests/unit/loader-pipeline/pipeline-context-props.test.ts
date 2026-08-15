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

/* ── preloader context props ─────────────────────────────────────── */

describe("preloader context props", () => {
	it("abortController is the same instance in preloader", async () => {
		const ac = new AbortController();
		let captured: unknown;
		const route = makeRoute({
			preloader: (ctx: Record<string, unknown>) => {
				captured = ctx.abortController;
				return {};
			},
		});
		await runPipeline(makeConfig({ abortController: ac, routes: [route] }));
		expect(captured).toBe(ac);
	});

	it("auth is the resolved auth object in preloader", async () => {
		const user = { id: "u1", role: "admin" };
		const authFn = vi.fn(() => Promise.resolve(user));
		let captured: unknown;
		const route = makeRoute({
			authenticate: [],
			preloader: (ctx: Record<string, unknown>) => {
				captured = ctx.auth;
				return {};
			},
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(captured).toBe(user);
	});

	it("env is the env from config in preloader", async () => {
		const env = { DB_URL: "postgres://localhost" };
		let captured: unknown;
		const route = makeRoute({
			preloader: (ctx: Record<string, unknown>) => {
				captured = ctx.env;
				return {};
			},
		});
		await runPipeline(makeConfig({ env, routes: [route] }));
		expect(captured).toBe(env);
	});

	it("location has correct pathname/params/search in preloader", async () => {
		let captured: Record<string, unknown> | undefined;
		const route = makeRoute({
			preloader: (ctx: Record<string, unknown>) => {
				captured = ctx.location as Record<string, unknown>;
				return {};
			},
			virtualPath: "_root_/users/[id]",
		});
		const url = new URL("http://localhost/users/42?sort=asc");
		await runPipeline(
			makeConfig({
				params: { id: "42" },
				routes: [route],
				url,
			}),
		);
		expect(captured).toBeDefined();
		expect(captured?.pathname).toBe("/users/42");
		expect(captured?.params).toEqual({ id: "42" });
	});

	it("request is the same Request instance in preloader", async () => {
		const req = new Request("http://localhost/");
		let captured: unknown;
		const route = makeRoute({
			preloader: (ctx: Record<string, unknown>) => {
				captured = ctx.request;
				return {};
			},
		});
		await runPipeline(makeConfig({ request: req, routes: [route] }));
		expect(captured).toBe(req);
	});

	it("preloaderContext is empty {} for root preloader", async () => {
		let captured: unknown;
		const route = makeRoute({
			preloader: (ctx: Record<string, unknown>) => {
				captured = ctx.preloaderContext;
				return {};
			},
		});
		await runPipeline(makeConfig({ routes: [route] }));
		expect(captured).toEqual({});
	});
});

/* ── authorize context props ─────────────────────────────────────── */

describe("authorize context props", () => {
	it("abortController passed to authorize", async () => {
		const ac = new AbortController();
		let captured: unknown;
		const route = makeRoute({
			authorize: (ctx: Record<string, unknown>) => {
				captured = ctx.abortController;
				return true;
			},
		});
		await runPipeline(makeConfig({ abortController: ac, routes: [route] }));
		expect(captured).toBe(ac);
	});

	it("auth passed to authorize", async () => {
		const user = { id: "u1" };
		const authFn = vi.fn(() => Promise.resolve(user));
		let captured: unknown;
		const route = makeRoute({
			authenticate: [],
			authorize: (ctx: Record<string, unknown>) => {
				captured = ctx.auth;
				return true;
			},
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(captured).toBe(user);
	});

	it("preloaderContext snapshot in authorize is after own preloader", async () => {
		let captured: unknown;
		const route = makeRoute({
			authorize: (ctx: Record<string, unknown>) => {
				captured = ctx.preloaderContext;
				return true;
			},
			preloader: () => ({ ready: true }),
		});
		await runPipeline(makeConfig({ routes: [route] }));
		expect(captured).toEqual({ ready: true });
	});

	it("location correct in authorize", async () => {
		let captured: Record<string, unknown> | undefined;
		const route = makeRoute({
			authorize: (ctx: Record<string, unknown>) => {
				captured = ctx.location as Record<string, unknown>;
				return true;
			},
			virtualPath: "_root_/dashboard",
		});
		const url = new URL("http://localhost/dashboard");
		await runPipeline(makeConfig({ routes: [route], url }));
		expect(captured?.pathname).toBe("/dashboard");
	});
});

/* ── loader context props ────────────────────────────────────────── */

describe("loader context props", () => {
	it("defer is a function in loader context", async () => {
		let captured: unknown;
		const route = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				captured = ctx.defer;
				return {};
			},
		});
		await runPipeline(makeConfig({ routes: [route] }));
		expect(typeof captured).toBe("function");
	});

	it("deps computed from loaderDeps function with search params", async () => {
		let captured: unknown;
		const route = makeRoute({
			effectsConfig: {
				loaderDeps: ({ search }: { search: Record<string, string | string[]> }) => [search.q ?? ""],
			},
			loader: (ctx: Record<string, unknown>) => {
				captured = ctx.deps;
				return {};
			},
		});
		const url = new URL("http://localhost/?q=test");
		await runPipeline(makeConfig({ routes: [route], url }));
		expect(captured).toEqual(["test"]);
	});

	it("no loaderDeps → deps = [] in loader", async () => {
		let captured: unknown;
		const route = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				captured = ctx.deps;
				return {};
			},
		});
		await runPipeline(makeConfig({ routes: [route] }));
		expect(captured).toEqual([]);
	});

	it("cause 'enter' threaded correctly to loader", async () => {
		let captured: unknown;
		const route = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				captured = ctx.cause;
				return {};
			},
		});
		await runPipeline(makeConfig({ cause: "enter", routes: [route] }));
		expect(captured).toBe("enter");
	});

	it("cause 'stay' threaded correctly to loader", async () => {
		let captured: unknown;
		const route = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				captured = ctx.cause;
				return {};
			},
		});
		await runPipeline(makeConfig({ cause: "stay", routes: [route] }));
		expect(captured).toBe("stay");
	});

	it("env same instance in loader", async () => {
		const env = { SECRET: "abc" };
		let captured: unknown;
		const route = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				captured = ctx.env;
				return {};
			},
		});
		await runPipeline(makeConfig({ env, routes: [route] }));
		expect(captured).toBe(env);
	});

	it("request same instance in loader", async () => {
		const req = new Request("http://localhost/");
		let captured: unknown;
		const route = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				captured = ctx.request;
				return {};
			},
		});
		await runPipeline(makeConfig({ request: req, routes: [route] }));
		expect(captured).toBe(req);
	});
});

/* ── head context props ──────────────────────────────────────────── */

describe("head context props", () => {
	it("cause threaded to head callback", async () => {
		let captured: unknown;
		const route = makeRoute({
			head: (ctx: Record<string, unknown>) => {
				captured = ctx.cause;
				return { title: "Test" };
			},
			loader: () => Promise.resolve({}),
		});
		await runPipeline(makeConfig({ cause: "prefetch", routes: [route] }));
		expect(captured).toBe("prefetch");
	});

	it("prefetch threaded to head callback", async () => {
		let captured: unknown;
		const route = makeRoute({
			head: (ctx: Record<string, unknown>) => {
				captured = ctx.prefetch;
				return { title: "Test" };
			},
			loader: () => Promise.resolve({}),
		});
		await runPipeline(makeConfig({ prefetch: true, routes: [route] }));
		expect(captured).toBe(true);
	});

	it("preloaderContext snapshot in head", async () => {
		let captured: unknown;
		const route = makeRoute({
			head: (ctx: Record<string, unknown>) => {
				captured = ctx.preloaderContext;
				return { title: "Test" };
			},
			loader: () => Promise.resolve({}),
			preloader: () => ({ theme: "dark" }),
		});
		await runPipeline(makeConfig({ routes: [route] }));
		expect(captured).toEqual({ theme: "dark" });
	});

	it("location in head callback", async () => {
		let captured: Record<string, unknown> | undefined;
		const route = makeRoute({
			head: (ctx: Record<string, unknown>) => {
				captured = ctx.location as Record<string, unknown>;
				return { title: "Test" };
			},
			loader: () => Promise.resolve({}),
			virtualPath: "_root_/about",
		});
		const url = new URL("http://localhost/about");
		await runPipeline(makeConfig({ routes: [route], url }));
		expect(captured?.pathname).toBe("/about");
	});
});

/* ── headers context props ───────────────────────────────────────── */

describe("headers context props", () => {
	it("cause threaded to headers callback", async () => {
		let captured: unknown;
		const route = makeRoute({
			headers: (ctx: Record<string, unknown>) => {
				captured = ctx.cause;
				return { "x-test": "1" };
			},
			loader: () => Promise.resolve({}),
		});
		await runPipeline(makeConfig({ cause: "stay", routes: [route] }));
		expect(captured).toBe("stay");
	});

	it("prefetch threaded to headers callback", async () => {
		let captured: unknown;
		const route = makeRoute({
			headers: (ctx: Record<string, unknown>) => {
				captured = ctx.prefetch;
				return { "x-test": "1" };
			},
			loader: () => Promise.resolve({}),
		});
		await runPipeline(makeConfig({ prefetch: true, routes: [route] }));
		expect(captured).toBe(true);
	});

	it("preloaderContext snapshot in headers", async () => {
		let captured: unknown;
		const route = makeRoute({
			headers: (ctx: Record<string, unknown>) => {
				captured = ctx.preloaderContext;
				return { "x-test": "1" };
			},
			loader: () => Promise.resolve({}),
			preloader: () => ({ region: "eu" }),
		});
		await runPipeline(makeConfig({ routes: [route] }));
		expect(captured).toEqual({ region: "eu" });
	});

	it("env and request in headers callback", async () => {
		const env = { KEY: "val" };
		const req = new Request("http://localhost/");
		let capturedEnv: unknown;
		let capturedReq: unknown;
		const route = makeRoute({
			headers: (ctx: Record<string, unknown>) => {
				capturedEnv = ctx.env;
				capturedReq = ctx.request;
				return { "x-test": "1" };
			},
			loader: () => Promise.resolve({}),
		});
		await runPipeline(makeConfig({ env, request: req, routes: [route] }));
		expect(capturedEnv).toBe(env);
		expect(capturedReq).toBe(req);
	});
});
