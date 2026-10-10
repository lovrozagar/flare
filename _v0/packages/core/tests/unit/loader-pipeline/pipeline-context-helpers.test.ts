import { describe, expect, it, vi } from "vitest";
import { NotFoundError, RedirectResponse, UnauthenticatedError, UnauthorizedError } from "../../../src/errors/index.ts";
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

describe("server throw helpers on preloader context", () => {
	it("receives ctx.redirect as function", async () => {
		let captured: unknown;
		const route = makeRoute({
			preloader: vi.fn((ctx: Record<string, unknown>) => {
				captured = ctx.redirect;
				return {};
			}),
		});
		await runPipeline(makeConfig({ routes: [route] }));
		expect(typeof captured).toBe("function");
	});

	it("receives ctx.notFound as function", async () => {
		let captured: unknown;
		const route = makeRoute({
			preloader: vi.fn((ctx: Record<string, unknown>) => {
				captured = ctx.notFound;
				return {};
			}),
		});
		await runPipeline(makeConfig({ routes: [route] }));
		expect(typeof captured).toBe("function");
	});

	it("receives ctx.unauthenticated as function", async () => {
		let captured: unknown;
		const route = makeRoute({
			preloader: vi.fn((ctx: Record<string, unknown>) => {
				captured = ctx.unauthenticated;
				return {};
			}),
		});
		await runPipeline(makeConfig({ routes: [route] }));
		expect(typeof captured).toBe("function");
	});

	it("receives ctx.unauthorized as function", async () => {
		let captured: unknown;
		const route = makeRoute({
			preloader: vi.fn((ctx: Record<string, unknown>) => {
				captured = ctx.unauthorized;
				return {};
			}),
		});
		await runPipeline(makeConfig({ routes: [route] }));
		expect(typeof captured).toBe("function");
	});
});

describe("server throw helpers on authorize context", () => {
	it("receives all 4 helpers", async () => {
		const captured: Record<string, unknown> = {};
		const route = makeRoute({
			authorize: vi.fn((ctx: Record<string, unknown>) => {
				captured.notFound = ctx.notFound;
				captured.redirect = ctx.redirect;
				captured.unauthenticated = ctx.unauthenticated;
				captured.unauthorized = ctx.unauthorized;
				return true;
			}),
		});
		await runPipeline(makeConfig({ routes: [route] }));
		expect(typeof captured.notFound).toBe("function");
		expect(typeof captured.redirect).toBe("function");
		expect(typeof captured.unauthenticated).toBe("function");
		expect(typeof captured.unauthorized).toBe("function");
	});
});

describe("server throw helpers on loader context", () => {
	it("receives all 4 helpers", async () => {
		const captured: Record<string, unknown> = {};
		const route = makeRoute({
			loader: vi.fn((ctx: Record<string, unknown>) => {
				captured.notFound = ctx.notFound;
				captured.redirect = ctx.redirect;
				captured.unauthenticated = ctx.unauthenticated;
				captured.unauthorized = ctx.unauthorized;
				return { data: "ok" };
			}),
		});
		await runPipeline(makeConfig({ routes: [route] }));
		expect(typeof captured.notFound).toBe("function");
		expect(typeof captured.redirect).toBe("function");
		expect(typeof captured.unauthenticated).toBe("function");
		expect(typeof captured.unauthorized).toBe("function");
	});
});

describe("throw helper behavior", () => {
	it("ctx.redirect() throws RedirectResponse", async () => {
		const route = makeRoute({
			preloader: vi.fn((ctx: Record<string, unknown>) => {
				(ctx.redirect as (opts: { to: string }) => never)({ to: "/login" });
			}),
		});
		await expect(runPipeline(makeConfig({ routes: [route] }))).rejects.toThrow(RedirectResponse);
	});

	it("ctx.notFound() throws NotFoundError", async () => {
		const route = makeRoute({
			loader: vi.fn((ctx: Record<string, unknown>) => {
				(ctx.notFound as () => never)();
			}),
		});
		const result = await runPipeline(makeConfig({ routes: [route] }));
		expect(result.matches[0]?.status).toBe("error");
		expect(result.matches[0]?.error).toBeInstanceOf(NotFoundError);
	});

	it("ctx.unauthenticated() throws UnauthenticatedError", async () => {
		const route = makeRoute({
			loader: vi.fn((ctx: Record<string, unknown>) => {
				(ctx.unauthenticated as () => never)();
			}),
		});
		const result = await runPipeline(makeConfig({ routes: [route] }));
		expect(result.matches[0]?.status).toBe("error");
		expect(result.matches[0]?.error).toBeInstanceOf(UnauthenticatedError);
	});

	it("ctx.unauthorized() throws UnauthorizedError", async () => {
		const route = makeRoute({
			loader: vi.fn((ctx: Record<string, unknown>) => {
				(ctx.unauthorized as () => never)();
			}),
		});
		const result = await runPipeline(makeConfig({ routes: [route] }));
		expect(result.matches[0]?.status).toBe("error");
		expect(result.matches[0]?.error).toBeInstanceOf(UnauthorizedError);
	});

	it("ctx.redirect() in preloader stops pipeline (thrown as redirect)", async () => {
		const loader = vi.fn(() => ({ data: "ok" }));
		const route = makeRoute({
			loader,
			preloader: vi.fn((ctx: Record<string, unknown>) => {
				(ctx.redirect as (opts: { to: string }) => never)({ to: "/x" });
			}),
		});
		await expect(runPipeline(makeConfig({ routes: [route] }))).rejects.toThrow(RedirectResponse);
		expect(loader).not.toHaveBeenCalled();
	});

	it("ctx.notFound() carries custom message", async () => {
		const route = makeRoute({
			loader: vi.fn((ctx: Record<string, unknown>) => {
				(ctx.notFound as (msg?: string) => never)("Item not found");
			}),
		});
		const result = await runPipeline(makeConfig({ routes: [route] }));
		expect(result.matches[0]?.error?.message).toBe("Item not found");
	});
});
