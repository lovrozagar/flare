import { describe, expect, it, vi } from "vitest";
import type { MiddlewareContext } from "../../../src/middleware/index.ts";
import { apiProxy } from "../../../src/middleware/builtins/api-proxy.ts";

function makeCtx(url: string, request?: Request): MiddlewareContext {
	const parsedUrl = new URL(url);
	return {
		bypass: (response: Response) => Object.freeze({ response, type: "bypass" as const }),
		env: {},
		next: () => Promise.resolve(Object.freeze({ type: "next" as const })),
		onResponse: () => {},
		request: request ?? new Request(url),
		requestType: "page" as const,
		respond: (response: Response) => Object.freeze({ response, type: "respond" as const }),
		url: parsedUrl,
	} as MiddlewareContext;
}

describe("apiProxy rewrite SSRF and hop-by-hop headers", () => {
	it("rejects rewrite() that returns an absolute URL to another origin", async () => {
		const targetFetch = vi.fn(async () => new Response("ok"));
		const mw = apiProxy({
			pathPrefix: "/api",
			rewrite: () => "https://evil.com/steal",
			target: () => ({ fetch: targetFetch }),
		});
		const result = await mw(makeCtx("http://localhost/api/users"));
		expect(targetFetch).not.toHaveBeenCalled();
		expect(result.type).toBe("bypass");
		if (result.type === "bypass") {
			expect(result.response.status).toBe(400);
		}
	});

	it("rejects rewrite() that returns a protocol-relative URL", async () => {
		const targetFetch = vi.fn(async () => new Response("ok"));
		const mw = apiProxy({
			pathPrefix: "/api",
			rewrite: () => "//evil.com/steal",
			target: () => ({ fetch: targetFetch }),
		});
		const result = await mw(makeCtx("http://localhost/api/users"));
		expect(targetFetch).not.toHaveBeenCalled();
		expect(result.type).toBe("bypass");
		if (result.type === "bypass") {
			expect(result.response.status).toBe(400);
		}
	});

	it("allows rewrite() to a same-origin path", async () => {
		let captured: string | undefined;
		const targetFetch = vi.fn(async (req: Request) => {
			captured = new URL(req.url).pathname;
			return new Response("ok");
		});
		const mw = apiProxy({
			pathPrefix: "/api",
			rewrite: (path) => path.replace("/api", "/v2"),
			target: () => ({ fetch: targetFetch }),
		});
		const result = await mw(makeCtx("http://localhost/api/users"));
		expect(result.type).toBe("bypass");
		expect(captured).toBe("/v2/users");
	});

	it("does not forward inbound Host to the target", async () => {
		let captured: Headers | undefined;
		const targetFetch = vi.fn(async (req: Request) => {
			captured = req.headers;
			return new Response("ok");
		});
		const mw = apiProxy({
			pathPrefix: "/api",
			target: () => ({ fetch: targetFetch }),
		});
		const request = new Request("http://localhost/api/users", {
			headers: {
				authorization: "Bearer secret",
				cookie: "sid=1",
				host: "evil.com",
			},
		});
		await mw(makeCtx("http://localhost/api/users", request));
		expect(captured?.get("host")).not.toBe("evil.com");
		expect(captured?.get("cookie")).toBe("sid=1");
		expect(captured?.get("authorization")).toBe("Bearer secret");
	});

	it("strips hop-by-hop Connection from the proxied request", async () => {
		let captured: Headers | undefined;
		const targetFetch = vi.fn(async (req: Request) => {
			captured = req.headers;
			return new Response("ok");
		});
		const mw = apiProxy({
			pathPrefix: "/api",
			target: () => ({ fetch: targetFetch }),
		});
		const request = new Request("http://localhost/api/users", {
			headers: { connection: "keep-alive" },
		});
		await mw(makeCtx("http://localhost/api/users", request));
		expect(captured?.get("connection")).toBeNull();
	});

	it("sets X-Content-Type-Options: nosniff on the bypassed response", async () => {
		const mw = apiProxy({
			pathPrefix: "/api",
			target: () => ({ fetch: async () => new Response("ok") }),
		});
		const result = await mw(makeCtx("http://localhost/api/users"));
		expect(result.type).toBe("bypass");
		if (result.type === "bypass") {
			expect(result.response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		}
	});
});
