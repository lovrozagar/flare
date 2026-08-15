import { describe, expect, it, vi } from "vitest";
import { RedirectResponse, UnauthenticatedError, UnauthorizedError } from "../../../src/errors/index.ts";
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

/* ── Optional auth + preloader interaction ─────────────────────────── */

describe("optional auth + preloader interaction", () => {
	it("optional auth null → preloader receives null auth", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		let capturedAuth: unknown = "sentinel";
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			preloader: (ctx: Record<string, unknown>) => {
				capturedAuth = ctx.auth;
				return { theme: "dark" };
			},
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(capturedAuth).toBeNull();
	});

	it("optional auth resolved → preloader receives user", async () => {
		const user = { id: "u1", role: "admin" };
		const authFn = vi.fn(() => Promise.resolve(user));
		let capturedAuth: unknown;
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			preloader: (ctx: Record<string, unknown>) => {
				capturedAuth = ctx.auth;
				return { theme: "dark" };
			},
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(capturedAuth).toBe(user);
	});

	it("optional auth null → preloader context still accumulates", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		let capturedCtx: unknown;
		const root = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			preloader: () => ({ theme: "dark" }),
			virtualPath: "_root_",
		});
		const page = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				capturedCtx = ctx.preloaderContext;
				return {};
			},
			virtualPath: "_root_/about",
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [root, page] }));
		expect(capturedCtx).toEqual({ theme: "dark" });
	});

	it("optional auth null → multi-level preloader chain works", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		let capturedCtx: unknown;
		const root = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			preloader: () => ({ locale: "en" }),
			virtualPath: "_root_",
		});
		const layout = makeRoute({
			_type: "layout",
			preloader: () => ({ sidebar: true }),
			virtualPath: "_root_/(dash)",
		});
		const page = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				capturedCtx = ctx.preloaderContext;
				return {};
			},
			virtualPath: "_root_/(dash)/home",
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [root, layout, page] }));
		expect(capturedCtx).toEqual({ locale: "en", sidebar: true });
	});

	it("optional auth → no authenticateFn → preloader still runs with null auth", async () => {
		let capturedAuth: unknown = "sentinel";
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			preloader: (ctx: Record<string, unknown>) => {
				capturedAuth = ctx.auth;
				return {};
			},
		});
		await runPipeline(makeConfig({ routes: [route] }));
		expect(capturedAuth).toBeNull();
	});
});

/* ── Optional auth + authorize interaction ─────────────────────────── */

describe("optional auth + authorize interaction", () => {
	it("optional auth null + authorize returns true → success", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			authorize: () => true,
			loader: () => ({ data: "ok" }),
		});
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(result.matches[0]?.status).toBe("success");
		expect(result.matches[0]?.loaderData).toEqual({ data: "ok" });
	});

	it("optional auth null + authorize returns false → UnauthorizedError", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			authorize: () => false,
			loader: vi.fn(() => "should not run"),
		});
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(result.matches[0]?.status).toBe("error");
		expect(result.matches[0]?.error).toBeInstanceOf(UnauthorizedError);
	});

	it("optional auth resolved + authorize returns false → UnauthorizedError", async () => {
		const authFn = vi.fn(() => Promise.resolve({ id: "u1" }));
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			authorize: () => false,
		});
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(result.matches[0]?.status).toBe("error");
		expect(result.matches[0]?.error).toBeInstanceOf(UnauthorizedError);
	});

	it("optional auth → authorize receives preloaderContext", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		let capturedCtx: unknown;
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			authorize: (ctx: Record<string, unknown>) => {
				capturedCtx = ctx.preloaderContext;
				return true;
			},
			preloader: () => ({ role: "guest" }),
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(capturedCtx).toEqual({ role: "guest" });
	});

	it("optional auth → authorize receives null auth", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		let capturedAuth: unknown = "sentinel";
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			authorize: (ctx: Record<string, unknown>) => {
				capturedAuth = ctx.auth;
				return true;
			},
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(capturedAuth).toBeNull();
	});

	it("optional auth authorize failure propagates to children", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const childLoader = vi.fn(() => "nope");
		const layout = makeRoute({
			_type: "layout",
			authenticate: [],
			authenticateMode: "optional",
			authorize: () => false,
			virtualPath: "_root_/(opt)",
		});
		const page = makeRoute({
			loader: childLoader,
			virtualPath: "_root_/(opt)/child",
		});
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [layout, page] }));
		expect(result.matches[0]?.status).toBe("error");
		expect(result.matches[1]?.status).toBe("error");
		expect(childLoader).not.toHaveBeenCalled();
	});
});

/* ── Optional auth + loader interaction ────────────────────────────── */

describe("optional auth + loader interaction", () => {
	it("optional auth null → loader runs with null auth", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		let capturedAuth: unknown = "sentinel";
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			loader: (ctx: Record<string, unknown>) => {
				capturedAuth = ctx.auth;
				return { data: "ok" };
			},
		});
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(capturedAuth).toBeNull();
		expect(result.matches[0]?.loaderData).toEqual({ data: "ok" });
	});

	it("optional auth resolved → loader runs with user", async () => {
		const user = { id: "u1" };
		const authFn = vi.fn(() => Promise.resolve(user));
		let capturedAuth: unknown;
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			loader: (ctx: Record<string, unknown>) => {
				capturedAuth = ctx.auth;
				return { data: "ok" };
			},
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(capturedAuth).toBe(user);
	});

	it("optional auth null → loader receives correct preloaderContext", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		let capturedCtx: unknown;
		const root = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			preloader: () => ({ locale: "en" }),
			virtualPath: "_root_",
		});
		const page = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				capturedCtx = ctx.preloaderContext;
				return {};
			},
			virtualPath: "_root_/page",
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [root, page] }));
		expect(capturedCtx).toEqual({ locale: "en" });
	});

	it("optional auth → loader error still produces error match (not throw)", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			loader: () => {
				throw new Error("loader broke");
			},
		});
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(result.matches[0]?.status).toBe("error");
		expect(result.matches[0]?.error?.message).toBe("loader broke");
	});

	it("optional auth → multiple loaders run in parallel", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const startTimes: number[] = [];
		const start = Date.now();
		const root = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			loader: async () => {
				startTimes.push(Date.now() - start);
				await new Promise((r) => setTimeout(r, 30));
				return { root: true };
			},
			virtualPath: "_root_",
		});
		const page = makeRoute({
			loader: async () => {
				startTimes.push(Date.now() - start);
				await new Promise((r) => setTimeout(r, 30));
				return { page: true };
			},
			virtualPath: "_root_/about",
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [root, page] }));
		expect(Math.abs((startTimes[0] ?? 0) - (startTimes[1] ?? 0))).toBeLessThan(20);
	});

	it("optional auth → route without loader still succeeds", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
		});
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(result.matches[0]?.status).toBe("success");
		expect(result.matches[0]?.loaderData).toBeUndefined();
	});
});

/* ── Mixed mode scenarios ──────────────────────────────────────────── */

describe("mixed auth modes — nested routes", () => {
	it("root optional + page required → throws when auth null", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const root = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			virtualPath: "_root_",
		});
		const page = makeRoute({
			authenticate: [],
			virtualPath: "_root_/secret",
		});
		await expect(runPipeline(makeConfig({ authenticateFn: authFn, routes: [root, page] }))).rejects.toThrow(
			UnauthenticatedError,
		);
	});

	it("root optional + page required → succeeds when auth resolves", async () => {
		const user = { id: "u1" };
		const authFn = vi.fn(() => Promise.resolve(user));
		const root = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			virtualPath: "_root_",
		});
		const page = makeRoute({
			authenticate: [],
			virtualPath: "_root_/secret",
		});
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [root, page] }));
		expect(result.auth).toBe(user);
		expect(result.matches).toHaveLength(2);
	});

	it("root required + page optional → throws when auth null", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const root = makeRoute({
			authenticate: [],
			virtualPath: "_root_",
		});
		const page = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			virtualPath: "_root_/about",
		});
		await expect(runPipeline(makeConfig({ authenticateFn: authFn, routes: [root, page] }))).rejects.toThrow(
			UnauthenticatedError,
		);
	});

	it("root required + page optional → succeeds when auth resolves", async () => {
		const user = { id: "u1" };
		const authFn = vi.fn(() => Promise.resolve(user));
		const root = makeRoute({
			authenticate: [],
			virtualPath: "_root_",
		});
		const page = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			virtualPath: "_root_/about",
		});
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [root, page] }));
		expect(result.auth).toBe(user);
	});

	it("all optional → never throws", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const routes = [
			makeRoute({ authenticate: [], authenticateMode: "optional", virtualPath: "_root_" }),
			makeRoute({ authenticate: [], authenticateMode: "optional", virtualPath: "_root_/(auth)" }),
			makeRoute({
				authenticate: [],
				authenticateMode: "optional",
				virtualPath: "_root_/(auth)/page",
			}),
		];
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes }));
		expect(result.auth).toBeNull();
		expect(result.matches).toHaveLength(3);
		expect(result.matches.every((m) => m.status === "success")).toBe(true);
	});

	it("layout optional + two child pages: one required, one optional", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const layout = makeRoute({
			_type: "layout",
			authenticate: [],
			authenticateMode: "optional",
			virtualPath: "_root_/(dash)",
		});
		const required = makeRoute({
			authenticate: [],
			virtualPath: "_root_/(dash)/admin",
		});
		const optional = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			virtualPath: "_root_/(dash)/profile",
		});
		await expect(
			runPipeline(makeConfig({ authenticateFn: authFn, routes: [layout, required, optional] })),
		).rejects.toThrow(UnauthenticatedError);
	});

	it("3 levels: root no-auth + layout optional + page required → throws", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const root = makeRoute({ virtualPath: "_root_" });
		const layout = makeRoute({
			_type: "layout",
			authenticate: [],
			authenticateMode: "optional",
			virtualPath: "_root_/(auth)",
		});
		const page = makeRoute({
			authenticate: [],
			virtualPath: "_root_/(auth)/secret",
		});
		await expect(runPipeline(makeConfig({ authenticateFn: authFn, routes: [root, layout, page] }))).rejects.toThrow(
			UnauthenticatedError,
		);
	});

	it("3 levels: root no-auth + layout optional + page optional → null auth OK", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const root = makeRoute({ virtualPath: "_root_" });
		const layout = makeRoute({
			_type: "layout",
			authenticate: [],
			authenticateMode: "optional",
			virtualPath: "_root_/(auth)",
		});
		const page = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			virtualPath: "_root_/(auth)/profile",
		});
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [root, layout, page] }));
		expect(result.auth).toBeNull();
		expect(result.matches).toHaveLength(3);
	});

	it("4 levels deep: mixed modes throughout → strictest wins", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const routes = [
			makeRoute({ authenticate: [], authenticateMode: "optional", virtualPath: "_root_" }),
			makeRoute({
				_type: "layout",
				authenticate: [],
				authenticateMode: "optional",
				virtualPath: "_root_/(a)",
			}),
			makeRoute({
				_type: "layout",
				authenticate: [],
				authenticateMode: "optional",
				virtualPath: "_root_/(a)/(b)",
			}),
			makeRoute({ authenticate: [], virtualPath: "_root_/(a)/(b)/secret" }),
		];
		await expect(runPipeline(makeConfig({ authenticateFn: authFn, routes }))).rejects.toThrow(UnauthenticatedError);
	});

	it("no authenticateFn + only optional routes → no throw", async () => {
		const routes = [
			makeRoute({ authenticate: [], authenticateMode: "optional", virtualPath: "_root_" }),
			makeRoute({ authenticate: [], authenticateMode: "optional", virtualPath: "_root_/about" }),
		];
		const result = await runPipeline(makeConfig({ routes }));
		expect(result.auth).toBeNull();
	});

	it("no authenticateFn + mixed optional + required → throws", async () => {
		const routes = [
			makeRoute({ authenticate: [], authenticateMode: "optional", virtualPath: "_root_" }),
			makeRoute({ authenticate: [], virtualPath: "_root_/admin" }),
		];
		await expect(runPipeline(makeConfig({ routes }))).rejects.toThrow(UnauthenticatedError);
	});

	it("optional route with no authenticate array + non-auth route → no auth at all", async () => {
		const authFn = vi.fn(() => Promise.resolve({ id: "u1" }));
		const routes = [makeRoute({ virtualPath: "_root_" }), makeRoute({ virtualPath: "_root_/about" })];
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes }));
		expect(authFn).not.toHaveBeenCalled();
		expect(result.auth).toBeNull();
	});
});

/* ── callerData edge cases ─────────────────────────────────────────── */

describe("callerData edge cases with optional auth", () => {
	it("first auth route is optional → callerData still extracted", async () => {
		let captured: unknown;
		const authFn = vi.fn((ctx: { callerData?: unknown[] }) => {
			captured = ctx.callerData;
			return Promise.resolve({ id: "u1" });
		});
		const route = makeRoute({
			authenticate: ["viewer"],
			authenticateMode: "optional",
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(captured).toEqual(["viewer"]);
	});

	it("optional first + required second → callerData from first (optional)", async () => {
		let captured: unknown;
		const authFn = vi.fn((ctx: { callerData?: unknown[] }) => {
			captured = ctx.callerData;
			return Promise.resolve({ id: "u1" });
		});
		const opt = makeRoute({
			authenticate: ["opt-data"],
			authenticateMode: "optional",
			virtualPath: "_root_",
		});
		const req = makeRoute({
			authenticate: ["req-data"],
			virtualPath: "_root_/page",
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [opt, req] }));
		expect(captured).toEqual(["opt-data"]);
	});

	it("required first + optional second → callerData from first (required)", async () => {
		let captured: unknown;
		const authFn = vi.fn((ctx: { callerData?: unknown[] }) => {
			captured = ctx.callerData;
			return Promise.resolve({ id: "u1" });
		});
		const req = makeRoute({
			authenticate: ["req-data"],
			virtualPath: "_root_",
		});
		const opt = makeRoute({
			authenticate: ["opt-data"],
			authenticateMode: "optional",
			virtualPath: "_root_/page",
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [req, opt] }));
		expect(captured).toEqual(["req-data"]);
	});

	it("non-auth first + optional second → callerData from optional", async () => {
		let captured: unknown;
		const authFn = vi.fn((ctx: { callerData?: unknown[] }) => {
			captured = ctx.callerData;
			return Promise.resolve({ id: "u1" });
		});
		const root = makeRoute({ virtualPath: "_root_" });
		const opt = makeRoute({
			authenticate: ["opt-data"],
			authenticateMode: "optional",
			virtualPath: "_root_/page",
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [root, opt] }));
		expect(captured).toEqual(["opt-data"]);
	});

	it("authenticateFn called exactly once with optional + required", async () => {
		const authFn = vi.fn(() => Promise.resolve({ id: "u1" }));
		const routes = [
			makeRoute({ authenticate: [], authenticateMode: "optional", virtualPath: "_root_" }),
			makeRoute({ authenticate: [], virtualPath: "_root_/page" }),
		];
		await runPipeline(makeConfig({ authenticateFn: authFn, routes }));
		expect(authFn).toHaveBeenCalledTimes(1);
	});

	it("authenticateFn called exactly once with 4 optional routes", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const routes = [
			makeRoute({ authenticate: [], authenticateMode: "optional", virtualPath: "_root_" }),
			makeRoute({ authenticate: ["a"], authenticateMode: "optional", virtualPath: "_root_/(a)" }),
			makeRoute({
				authenticate: ["b"],
				authenticateMode: "optional",
				virtualPath: "_root_/(a)/(b)",
			}),
			makeRoute({
				authenticate: [],
				authenticateMode: "optional",
				virtualPath: "_root_/(a)/(b)/page",
			}),
		];
		await runPipeline(makeConfig({ authenticateFn: authFn, routes }));
		expect(authFn).toHaveBeenCalledTimes(1);
	});
});

/* ── Error handling with optional auth ─────────────────────────────── */

describe("error handling with optional auth", () => {
	it("authenticateFn throws RedirectResponse for optional → pipeline throws redirect", async () => {
		const authFn = () => {
			throw new RedirectResponse({ to: "/login" });
		};
		const route = makeRoute({ authenticate: [], authenticateMode: "optional" });
		await expect(runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }))).rejects.toThrow(
			RedirectResponse,
		);
	});

	it("authenticateFn throws generic error for optional → pipeline throws", async () => {
		const authFn = () => {
			throw new Error("auth service down");
		};
		const route = makeRoute({ authenticate: [], authenticateMode: "optional" });
		await expect(runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }))).rejects.toThrow(
			"auth service down",
		);
	});

	it("optional auth null → preloader throws → captured as match error (error recovery)", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			preloader: () => {
				throw new Error("preloader crash");
			},
		});
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(result.matches[0]?.status).toBe("error");
		expect(result.matches[0]?.error?.message).toBe("preloader crash");
	});

	it("optional auth null → authorize throws → pipeline throws", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			authorize: () => {
				throw new Error("authorize crash");
			},
		});
		await expect(runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }))).rejects.toThrow(
			"authorize crash",
		);
	});

	it("optional auth undefined → treated as null (no throw)", async () => {
		const authFn = vi.fn(() => Promise.resolve(undefined));
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			loader: () => ({ data: "ok" }),
		});
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(result.matches[0]?.status).toBe("success");
	});

	it("required auth undefined → throws UnauthenticatedError", async () => {
		const authFn = vi.fn(() => Promise.resolve(undefined));
		const route = makeRoute({ authenticate: [] });
		await expect(runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }))).rejects.toThrow(
			UnauthenticatedError,
		);
	});
});

/* ── Head + headers chain with optional auth ───────────────────────── */

describe("head + headers with optional auth", () => {
	it("optional auth null → head chain still runs", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			head: () => ({ title: "Public" }),
			loader: () => ({ data: "ok" }),
		});
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(result.matches[0]?.headConfig).toEqual({ title: "Public" });
	});

	it("optional auth null → headers chain still runs", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			headers: () => ({ "x-auth": "none" }),
			loader: () => ({ data: "ok" }),
		});
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(result.matches[0]?.responseHeaders).toEqual({ "x-auth": "none" });
	});

	it("optional auth resolved → head can use auth from preloaderContext", async () => {
		const user = { id: "u1" };
		const authFn = vi.fn(() => Promise.resolve(user));
		let headAuth: unknown;
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			head: (ctx: Record<string, unknown>) => {
				headAuth = ctx.preloaderContext;
				return { title: "User" };
			},
			loader: () => ({}),
			preloader: () => ({ role: "admin" }),
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(headAuth).toEqual({ role: "admin" });
	});
});

/* ── Pipeline result shape with optional auth ──────────────────────── */

describe("pipeline result shape", () => {
	it("optional auth null → result.auth is null", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const route = makeRoute({ authenticate: [], authenticateMode: "optional" });
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(result.auth).toBeNull();
	});

	it("optional auth resolved → result.auth is user object", async () => {
		const user = { id: "u1" };
		const authFn = vi.fn(() => Promise.resolve(user));
		const route = makeRoute({ authenticate: [], authenticateMode: "optional" });
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(result.auth).toBe(user);
	});

	it("no auth routes → result.auth is null", async () => {
		const route = makeRoute();
		const result = await runPipeline(makeConfig({ routes: [route] }));
		expect(result.auth).toBeNull();
	});

	it("optional auth → deferContexts populated per route", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const routes = [
			makeRoute({ authenticate: [], authenticateMode: "optional", virtualPath: "_root_" }),
			makeRoute({ virtualPath: "_root_/about" }),
		];
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes }));
		expect(result.deferContexts.size).toBe(2);
	});

	it("optional auth → matches preserve preloaderContext snapshots", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const root = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			preloader: () => ({ root: true }),
			virtualPath: "_root_",
		});
		const page = makeRoute({
			preloader: () => ({ page: true }),
			virtualPath: "_root_/about",
		});
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [root, page] }));
		expect(result.matches[0]?.preloaderContext).toEqual({ root: true });
		expect(result.matches[1]?.preloaderContext).toEqual({ page: true, root: true });
	});
});

/* ── Phase ordering with optional auth ─────────────────────────────── */

describe("phase ordering with optional auth", () => {
	it("auth → preloader → authorize → loader (correct order)", async () => {
		const order: string[] = [];
		const authFn = vi.fn(() => {
			order.push("auth");
			return Promise.resolve({ id: "u1" });
		});
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			authorize: () => {
				order.push("authorize");
				return true;
			},
			loader: () => {
				order.push("loader");
				return {};
			},
			preloader: () => {
				order.push("preloader");
				return {};
			},
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(order).toEqual(["auth", "preloader", "authorize", "loader"]);
	});

	it("optional auth null → same phase ordering", async () => {
		const order: string[] = [];
		const authFn = vi.fn(() => {
			order.push("auth");
			return Promise.resolve(null);
		});
		const route = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			authorize: () => {
				order.push("authorize");
				return true;
			},
			loader: () => {
				order.push("loader");
				return {};
			},
			preloader: () => {
				order.push("preloader");
				return {};
			},
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(order).toEqual(["auth", "preloader", "authorize", "loader"]);
	});

	it("multi-route: preloaders interleave correctly with optional auth", async () => {
		const order: string[] = [];
		const authFn = vi.fn(() => {
			order.push("auth");
			return Promise.resolve(null);
		});
		const root = makeRoute({
			authenticate: [],
			authenticateMode: "optional",
			authorize: () => {
				order.push("root-authorize");
				return true;
			},
			preloader: () => {
				order.push("root-preloader");
				return {};
			},
			virtualPath: "_root_",
		});
		const page = makeRoute({
			authorize: () => {
				order.push("page-authorize");
				return true;
			},
			preloader: () => {
				order.push("page-preloader");
				return {};
			},
			virtualPath: "_root_/about",
		});
		await runPipeline(makeConfig({ authenticateFn: authFn, routes: [root, page] }));
		expect(order).toEqual(["auth", "root-preloader", "root-authorize", "page-preloader", "page-authorize"]);
	});
});

/* ── Response routes with auth modes ───────────────────────────────── */

describe("response routes with auth modes", () => {
	it("response route with required auth → throws when null", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const route = makeRoute({
			_type: "response",
			authenticate: [],
			response: () => new Response("ok"),
		});
		await expect(runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }))).rejects.toThrow(
			UnauthenticatedError,
		);
	});

	it("response route with optional auth → does not throw when null", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const route = makeRoute({
			_type: "response",
			authenticate: [],
			authenticateMode: "optional",
		});
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(result.auth).toBeNull();
	});
});

/* ── authenticateMode explicitly true (backwards compat) ───────────── */

describe("authenticateMode explicitly true", () => {
	it("authenticateMode: true + null auth → throws", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const route = makeRoute({
			authenticate: [],
			authenticateMode: true,
		});
		await expect(runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }))).rejects.toThrow(
			UnauthenticatedError,
		);
	});

	it("authenticateMode: true + resolved → passes through", async () => {
		const user = { id: "u1" };
		const authFn = vi.fn(() => Promise.resolve(user));
		const route = makeRoute({
			authenticate: [],
			authenticateMode: true,
		});
		const result = await runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] }));
		expect(result.auth).toBe(user);
	});

	it("authenticateMode: true behaves same as no mode (default required)", async () => {
		const authFn = vi.fn(() => Promise.resolve(null));
		const withMode = makeRoute({ authenticate: [], authenticateMode: true });
		const withoutMode = makeRoute({ authenticate: [] });

		await expect(runPipeline(makeConfig({ authenticateFn: authFn, routes: [withMode] }))).rejects.toThrow(
			UnauthenticatedError,
		);

		await expect(runPipeline(makeConfig({ authenticateFn: authFn, routes: [withoutMode] }))).rejects.toThrow(
			UnauthenticatedError,
		);
	});
});
