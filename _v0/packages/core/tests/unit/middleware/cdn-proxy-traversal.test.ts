import { describe, expect, it, vi } from "vitest";

function createMockCtx(pathname: string, withObject = false) {
	const url = new URL(`http://localhost${pathname}`);
	let bypassed: Response | null = null;
	let nexted = false;

	const getMock = withObject
		? vi.fn(async () => ({
				body: new ReadableStream(),
				etag: '"abc"',
				httpMetadata: { contentType: "image/png" },
				size: 1024,
			}))
		: vi.fn(async () => null);

	return {
		bypass: (res: Response) => {
			bypassed = res;
			return Promise.resolve(new Response(null));
		},
		get bypassed() {
			return bypassed;
		},
		env: {
			CDN_BUCKET: { get: getMock },
		},
		next: () => {
			nexted = true;
			return Promise.resolve(new Response(null));
		},
		get nexted() {
			return nexted;
		},
		url,
	};
}

describe("Task 6: CDN proxy path traversal hardening", () => {
	async function loadCdnProxy() {
		const { cdnProxy } = await import("../../../src/middleware/builtins/cdn-proxy");
		return cdnProxy({
			bucket: (ctx: { env: { CDN_BUCKET: unknown } }) => ctx.env.CDN_BUCKET as { get: (key: string) => Promise<null> },
			pathPrefix: "/cdn",
		});
	}

	it("normal path passes through: /cdn/assets/image.png", async () => {
		const middleware = await loadCdnProxy();
		const ctx = createMockCtx("/cdn/assets/image.png", true);
		await middleware(ctx as never);
		expect(ctx.bypassed).not.toBeNull();
		expect(ctx.bypassed?.status).toBe(200);
	});

	it("normal path with valid dots: /cdn/file.name.ext", async () => {
		const middleware = await loadCdnProxy();
		const ctx = createMockCtx("/cdn/file.name.ext", true);
		await middleware(ctx as never);
		expect(ctx.bypassed?.status).toBe(200);
	});

	it("../ blocked (URL-normalized by browser, but raw .. in key caught)", async () => {
		const middleware = await loadCdnProxy();
		/* Browsers resolve ../; simulate a raw key containing .. post-prefix */
		const ctx = createMockCtx("/cdn/sub/../../etc/passwd");
		await middleware(ctx as never);
		/* URL constructor resolves this to /etc/passwd, which doesn't start
		 * with /cdn/ → passes to next(). This is correct behavior —
		 * URL normalization prevents traversal before middleware runs. */
		expect(ctx.nexted).toBe(true);
	});

	it("..%2f (encoded slash) blocked after decode", async () => {
		const middleware = await loadCdnProxy();
		const ctx = createMockCtx("/cdn/..%2f..%2fetc%2fpasswd");
		await middleware(ctx as never);
		expect(ctx.bypassed?.status).toBe(400);
	});

	it("..%5c (encoded backslash) blocked", async () => {
		const middleware = await loadCdnProxy();
		const ctx = createMockCtx("/cdn/..%5c..%5cwindows%5csystem32");
		await middleware(ctx as never);
		/* After decode: ..\..\\windows\\system32 — should be blocked */
		expect(ctx.bypassed?.status).toBe(400);
	});

	it("%2e%2e/ (encoded dots) blocked after decode", async () => {
		const middleware = await loadCdnProxy();
		/* %2e%2e in the URL path gets decoded by URL constructor to .. which
		 * triggers path resolution. Use a key that survives URL parsing. */
		const ctx = createMockCtx("/cdn/assets%2f..%2f..%2fetc%2fpasswd");
		await middleware(ctx as never);
		/* After decodeURIComponent: assets/../../etc/passwd → contains .. */
		expect(ctx.bypassed?.status).toBe(400);
	});

	it("....// (double dots) blocked", async () => {
		const middleware = await loadCdnProxy();
		const ctx = createMockCtx("/cdn/....//etc/passwd");
		await middleware(ctx as never);
		/* Contains ".." so caught */
		expect(ctx.bypassed?.status).toBe(400);
	});

	it("\\0 (null byte) blocked", async () => {
		const middleware = await loadCdnProxy();
		const ctx = createMockCtx("/cdn/file%00.png");
		await middleware(ctx as never);
		expect(ctx.bypassed?.status).toBe(400);
	});

	it("path with backslash ..\\\\  blocked", async () => {
		const middleware = await loadCdnProxy();
		const ctx = createMockCtx("/cdn/..%5c/secret");
		await middleware(ctx as never);
		/* After decode: ..\\/ — contains backslash, should be blocked */
		expect(ctx.bypassed?.status).toBe(400);
	});

	it("path with \\r\\n blocked", async () => {
		const middleware = await loadCdnProxy();
		const ctx = createMockCtx("/cdn/file%0d%0a.png");
		await middleware(ctx as never);
		expect(ctx.bypassed?.status).toBe(400);
	});

	it("non-matching prefix passes to next()", async () => {
		const middleware = await loadCdnProxy();
		const ctx = createMockCtx("/api/health");
		await middleware(ctx as never);
		expect(ctx.nexted).toBe(true);
		expect(ctx.bypassed).toBeNull();
	});

	it("object not found returns 404", async () => {
		const middleware = await loadCdnProxy();
		const ctx = createMockCtx("/cdn/nonexistent.png");
		await middleware(ctx as never);
		expect(ctx.bypassed?.status).toBe(404);
	});

	it("malformed percent encoding returns 400", async () => {
		const middleware = await loadCdnProxy();
		const ctx = createMockCtx("/cdn/%GG%ZZ");
		await middleware(ctx as never);
		expect(ctx.bypassed?.status).toBe(400);
	});
});
