import { describe, expect, it, vi } from "vitest";
import { apiProxy } from "../../../src/middleware/builtins/api-proxy.ts";

function createMockCtx(pathname: string, search = "") {
	const url = new URL(`http://localhost${pathname}${search}`);
	let bypassed: Response | null = null;
	let nexted = false;

	return {
		bypass: (res: Response) => {
			bypassed = res;
			return Promise.resolve(new Response(null));
		},
		get bypassed() {
			return bypassed;
		},
		env: {},
		next: () => {
			nexted = true;
			return Promise.resolve(new Response(null));
		},
		get nexted() {
			return nexted;
		},
		request: new Request(url),
		url,
	};
}

const okService = { fetch: vi.fn(async () => new Response("ok")) };

describe("Task 3: api-proxy safety", () => {
	it("normal proxy request works", async () => {
		const middleware = apiProxy({
			pathPrefix: "/api",
			target: () => okService,
		});
		const ctx = createMockCtx("/api/users");
		await middleware(ctx as never);
		expect(ctx.bypassed).not.toBeNull();
		expect(okService.fetch).toHaveBeenCalled();
	});

	it("non-matching path passes to next()", async () => {
		const middleware = apiProxy({
			pathPrefix: "/api",
			target: () => okService,
		});
		const ctx = createMockCtx("/other/path");
		await middleware(ctx as never);
		expect(ctx.nexted).toBe(true);
		expect(ctx.bypassed).toBeNull();
	});

	it("config.rewrite() returning malformed path returns 502", async () => {
		const middleware = apiProxy({
			pathPrefix: "/api",
			rewrite: () => {
				throw new Error("rewrite failed");
			},
			target: () => okService,
		});
		const ctx = createMockCtx("/api/users");
		await middleware(ctx as never);
		expect(ctx.bypassed?.status).toBe(502);
	});

	it("config.headers() throwing returns 502", async () => {
		const middleware = apiProxy({
			headers: () => {
				throw new Error("headers failed");
			},
			pathPrefix: "/api",
			target: () => okService,
		});
		const ctx = createMockCtx("/api/users");
		await middleware(ctx as never);
		expect(ctx.bypassed?.status).toBe(502);
	});

	it("config.target() throwing returns 502", async () => {
		const middleware = apiProxy({
			pathPrefix: "/api",
			target: () => {
				throw new Error("target failed");
			},
		});
		const ctx = createMockCtx("/api/users");
		await middleware(ctx as never);
		expect(ctx.bypassed?.status).toBe(502);
	});

	it("service.fetch() rejection returns 502", async () => {
		const failService = {
			fetch: vi.fn(async () => {
				throw new Error("service down");
			}),
		};
		const middleware = apiProxy({
			pathPrefix: "/api",
			target: () => failService,
		});
		const ctx = createMockCtx("/api/users");
		await middleware(ctx as never);
		expect(ctx.bypassed?.status).toBe(502);
	});

	it("missing config.headers (undefined) works fine", async () => {
		const middleware = apiProxy({
			pathPrefix: "/api",
			target: () => okService,
		});
		const ctx = createMockCtx("/api/data");
		await middleware(ctx as never);
		expect(ctx.bypassed).not.toBeNull();
	});

	it("search params preserved on proxy", async () => {
		const captureFetch = vi.fn(async () => new Response("ok"));
		const middleware = apiProxy({
			pathPrefix: "/api",
			target: () => ({ fetch: captureFetch }),
		});
		const ctx = createMockCtx("/api/search", "?q=test&page=2");
		await middleware(ctx as never);
		expect(captureFetch).toHaveBeenCalled();
		const calledArg: unknown = captureFetch.mock.calls[0];
		if (Array.isArray(calledArg) && calledArg[0] instanceof Request) {
			const u = new URL(calledArg[0].url);
			expect(u.searchParams.get("q")).toBe("test");
			expect(u.searchParams.get("page")).toBe("2");
		}
	});
});
