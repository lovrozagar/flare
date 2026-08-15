/**
 * Iteration 9 — TDD red-phase tests for security/perf audit.
 * All tests should FAIL before fixes are applied.
 */
import { describe, expect, it } from "vitest";

/* ── #1: CDN proxy path traversal via encoded segments ───────────── */

describe("#1: cdnProxy path traversal guard", () => {
	it("rejects keys containing .. after URL decode", async () => {
		const { cdnProxy } = await import("../../src/middleware/builtins/cdn-proxy.ts");

		let requestedKey: string | undefined;
		const middleware = cdnProxy({
			bucket: () => ({
				get: async (key: string) => {
					requestedKey = key;
					return null;
				},
			}),
			pathPrefix: "/cdn",
		});

		const req = new Request("http://localhost/cdn/..%2F..%2Fsecret");
		const url = new URL(req.url);
		const ctx = {
			bypass: (r: Response) => ({ response: r, type: "bypass" as const }),
			env: {},
			next: async () => ({ type: "next" as const }),
			request: req,
			respond: (r: Response) => ({ response: r, type: "respond" as const }),
			url,
		};

		await middleware(ctx as never);
		/* After fix, the middleware should reject traversal before calling bucket.get */
		expect(requestedKey).toBeUndefined();
	});

	it("rejects keys with null bytes", async () => {
		const { cdnProxy } = await import("../../src/middleware/builtins/cdn-proxy.ts");

		let requestedKey: string | undefined;
		const middleware = cdnProxy({
			bucket: () => ({
				get: async (key: string) => {
					requestedKey = key;
					return null;
				},
			}),
			pathPrefix: "/cdn",
		});

		const req = new Request("http://localhost/cdn/file%00.txt");
		const url = new URL(req.url);
		const ctx = {
			bypass: (r: Response) => ({ response: r, type: "bypass" as const }),
			env: {},
			next: async () => ({ type: "next" as const }),
			request: req,
			respond: (r: Response) => ({ response: r, type: "respond" as const }),
			url,
		};

		await middleware(ctx as never);
		expect(requestedKey).toBeUndefined();
	});
});

/* ── #2: NDJSON error message leaks internals ────────────────────── */

describe("#2: NDJSON formatErrorMessage sanitization", () => {
	it("does not include raw error message in production output", async () => {
		const { formatErrorMessage } = await import("../../src/ndjson-server/index.ts");
		const error = new Error("SQLITE_ERROR: no such table: users (connection: turso://db-secret.turso.io)");
		const output = formatErrorMessage("m1", error);
		const parsed = JSON.parse(output);
		/* Raw error messages with internal details should not reach the client */
		expect(parsed.e.message).not.toContain("turso://");
		expect(parsed.e.message).not.toContain("SQLITE_ERROR");
	});
});

/* ── #3: escapeJsString missing newline/CR escape ────────────────── */

describe("#3: escapeJsString newline injection", () => {
	it("escapes newlines in theme escapeJsString", async () => {
		const { escapeJsString } = await import("../../src/theme/index.tsx");
		const result = escapeJsString("key\n;alert(1)//");
		expect(result).not.toContain("\n");
		expect(result).toContain("\\n");
	});

	it("escapes carriage returns in theme escapeJsString", async () => {
		const { escapeJsString } = await import("../../src/theme/index.tsx");
		const result = escapeJsString("key\r;alert(1)//");
		expect(result).not.toContain("\r");
		expect(result).toContain("\\r");
	});

	it("escapes line separator U+2028", async () => {
		const { escapeJsString } = await import("../../src/theme/index.tsx");
		const result = escapeJsString("key\u2028alert(1)");
		expect(result).not.toContain("\u2028");
	});
});

/* ── #4: unbounded x-m header parsing ────────────────────────────── */

describe("#4: x-m header stale match IDs bounded", () => {
	it("source caps stale match IDs to prevent CPU exhaustion", async () => {
		const { readFileSync } = await import("node:fs");
		const { resolve } = await import("node:path");
		const source = readFileSync(resolve(__dirname, "../../src/server-handler/index.ts"), "utf-8");
		/* Should have a .slice() or limit on the split result */
		expect(source).toMatch(/x-m.*split.*slice|MAX_STALE/);
	});
});

/* ── #5: htmlCache bypass open to external requests ──────────────── */

describe("#5: htmlCache skip-cache headers restricted", () => {
	it("source does not allow arbitrary x-skip-cache bypass", async () => {
		const { readFileSync } = await import("node:fs");
		const { resolve } = await import("node:path");
		const source = readFileSync(resolve(__dirname, "../../src/middleware/builtins/cdn-proxy.ts"), "utf-8");
		/* x-skip-cache should be gated or removed, not open to any request */
		expect(source).not.toMatch(/x-skip-cache.*===.*"1"/);
	});
});
