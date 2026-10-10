import { describe, expect, it, vi } from "vitest";
import type { PipelineConfig, ResolvedRoute } from "../../../src/loader-pipeline/index.ts";
import { runPipeline } from "../../../src/loader-pipeline/index.ts";
import { runWithServerContext } from "../../../src/server-context/index.ts";

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

describe("serverContext in pipeline", () => {
	it("preloader receives serverContext", async () => {
		let captured: unknown;
		const route = makeRoute({
			preloader: (ctx: Record<string, unknown>) => {
				captured = ctx.serverContext;
				return {};
			},
		});
		await runWithServerContext(
			{
				nonce: "x",
				request: new Request("http://localhost/"),
				serverContext: { db: "test" },
			},
			() => runPipeline(makeConfig({ routes: [route] })),
		);
		expect(captured).toEqual({ db: "test" });
	});

	it("authorize receives serverContext", async () => {
		let captured: unknown;
		const route = makeRoute({
			authorize: (ctx: Record<string, unknown>) => {
				captured = ctx.serverContext;
				return true;
			},
		});
		await runWithServerContext(
			{
				nonce: "x",
				request: new Request("http://localhost/"),
				serverContext: { role: "admin" },
			},
			() => runPipeline(makeConfig({ routes: [route] })),
		);
		expect(captured).toEqual({ role: "admin" });
	});

	it("loader receives serverContext", async () => {
		let captured: unknown;
		const route = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				captured = ctx.serverContext;
				return {};
			},
		});
		await runWithServerContext(
			{
				nonce: "x",
				request: new Request("http://localhost/"),
				serverContext: { requestId: "req-123" },
			},
			() => runPipeline(makeConfig({ routes: [route] })),
		);
		expect(captured).toEqual({ requestId: "req-123" });
	});

	it("head callback receives serverContext", async () => {
		let captured: unknown;
		const route = makeRoute({
			head: (ctx: Record<string, unknown>) => {
				captured = ctx.serverContext;
				return { title: "Test" };
			},
			loader: () => Promise.resolve({}),
		});
		await runWithServerContext(
			{
				nonce: "x",
				request: new Request("http://localhost/"),
				serverContext: { theme: "dark" },
			},
			() => runPipeline(makeConfig({ routes: [route] })),
		);
		expect(captured).toEqual({ theme: "dark" });
	});

	it("headers callback receives serverContext", async () => {
		let captured: unknown;
		const route = makeRoute({
			headers: (ctx: Record<string, unknown>) => {
				captured = ctx.serverContext;
				return { "x-test": "1" };
			},
			loader: () => Promise.resolve({}),
		});
		await runWithServerContext(
			{
				nonce: "x",
				request: new Request("http://localhost/"),
				serverContext: { region: "eu" },
			},
			() => runPipeline(makeConfig({ routes: [route] })),
		);
		expect(captured).toEqual({ region: "eu" });
	});

	it("authenticateFn receives serverContext", async () => {
		let captured: unknown;
		const authFn = vi.fn((ctx: { serverContext: Record<string, unknown> }) => {
			captured = ctx.serverContext;
			return { userId: "u1" };
		});
		const route = makeRoute({ authenticate: [] });
		await runWithServerContext(
			{
				nonce: "x",
				request: new Request("http://localhost/"),
				serverContext: { secret: "key" },
			},
			() => runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] })),
		);
		expect(captured).toEqual({ secret: "key" });
	});

	it("same serverContext reference across all phases", async () => {
		const refs: unknown[] = [];
		const authFn = vi.fn((ctx: { serverContext: Record<string, unknown> }) => {
			refs.push(ctx.serverContext);
			return { userId: "u1" };
		});
		const route = makeRoute({
			authenticate: [],
			authorize: (ctx: Record<string, unknown>) => {
				refs.push(ctx.serverContext);
				return true;
			},
			loader: (ctx: Record<string, unknown>) => {
				refs.push(ctx.serverContext);
				return {};
			},
			preloader: (ctx: Record<string, unknown>) => {
				refs.push(ctx.serverContext);
				return {};
			},
		});
		const serverContext = { shared: true };
		await runWithServerContext({ nonce: "x", request: new Request("http://localhost/"), serverContext }, () =>
			runPipeline(makeConfig({ authenticateFn: authFn, routes: [route] })),
		);
		expect(refs.length).toBe(4);
		for (const ref of refs) {
			expect(ref).toBe(serverContext);
		}
	});
});
