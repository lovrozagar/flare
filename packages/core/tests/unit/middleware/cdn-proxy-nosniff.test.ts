import { describe, expect, it, vi } from "vitest";
import type { MiddlewareContext } from "../../../src/middleware/index.ts";
import { cdnProxy } from "../../../src/middleware/builtins/cdn-proxy.ts";

function makeCtx(pathname: string, env: unknown): MiddlewareContext {
	const url = new URL(`http://localhost${pathname}`);
	return {
		bypass: (response: Response) => Object.freeze({ response, type: "bypass" as const }),
		env,
		next: () => Promise.resolve(Object.freeze({ type: "next" as const })),
		onResponse: () => {},
		request: new Request(url),
		requestType: "page" as const,
		respond: (response: Response) => Object.freeze({ response, type: "respond" as const }),
		url,
	} as MiddlewareContext;
}

function makeObject(contentType?: string) {
	return {
		body: new ReadableStream({
			start(c) {
				c.enqueue(new TextEncoder().encode("blob"));
				c.close();
			},
		}),
		etag: '"abc"',
		httpMetadata: contentType ? { contentType } : undefined,
		size: 4,
	};
}

describe("cdnProxy sets nosniff on bypassed objects", () => {
	it("sets X-Content-Type-Options: nosniff on a successful object", async () => {
		const bucket = { get: vi.fn(async () => makeObject("image/png")) };
		const mw = cdnProxy({ bucket: () => bucket, pathPrefix: "/cdn" });
		const result = await mw(makeCtx("/cdn/img.png", { bucket }));
		expect(result.type).toBe("bypass");
		if (result.type === "bypass") {
			expect(result.response.headers.get("X-Content-Type-Options")).toBe("nosniff");
			expect(result.response.headers.get("Content-Type")).toBe("image/png");
		}
	});

	it("forces download for HTML served from R2 (untrusted on app origin)", async () => {
		const bucket = { get: vi.fn(async () => makeObject("text/html")) };
		const mw = cdnProxy({ bucket: () => bucket, pathPrefix: "/cdn" });
		const result = await mw(makeCtx("/cdn/page.html", { bucket }));
		expect(result.type).toBe("bypass");
		if (result.type === "bypass") {
			expect(result.response.headers.get("X-Content-Type-Options")).toBe("nosniff");
			expect(result.response.headers.get("Content-Disposition")).toBe("attachment");
		}
	});

	it("forces download for SVG served from R2", async () => {
		const bucket = { get: vi.fn(async () => makeObject("image/svg+xml")) };
		const mw = cdnProxy({ bucket: () => bucket, pathPrefix: "/cdn" });
		const result = await mw(makeCtx("/cdn/icon.svg", { bucket }));
		expect(result.type).toBe("bypass");
		if (result.type === "bypass") {
			expect(result.response.headers.get("X-Content-Type-Options")).toBe("nosniff");
			expect(result.response.headers.get("Content-Disposition")).toBe("attachment");
		}
	});

	it("does not attach Content-Disposition for ordinary images", async () => {
		const bucket = { get: vi.fn(async () => makeObject("image/webp")) };
		const mw = cdnProxy({ bucket: () => bucket, pathPrefix: "/cdn" });
		const result = await mw(makeCtx("/cdn/photo.webp", { bucket }));
		expect(result.type).toBe("bypass");
		if (result.type === "bypass") {
			expect(result.response.headers.get("Content-Disposition")).toBeNull();
			expect(result.response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		}
	});

	it("sets nosniff on 404 bypass", async () => {
		const bucket = { get: vi.fn(async () => null) };
		const mw = cdnProxy({ bucket: () => bucket, pathPrefix: "/cdn" });
		const result = await mw(makeCtx("/cdn/missing.png", { bucket }));
		expect(result.type).toBe("bypass");
		if (result.type === "bypass") {
			expect(result.response.status).toBe(404);
			expect(result.response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		}
	});
});
