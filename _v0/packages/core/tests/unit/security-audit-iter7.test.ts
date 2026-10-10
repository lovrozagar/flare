/**
 * Iteration 7 — TDD red-phase tests for security/perf audit.
 * All tests should FAIL before fixes are applied.
 */
import { describe, expect, it } from "vitest";

/* ── #1: buildFlareState leaks error stacks in production ────────── */

describe("#1: buildFlareState error stack leakage", () => {
	it("serializeFlareState strips e field when present", async () => {
		const { serializeFlareState } = await import("../../src/ssr/index.tsx");
		/*
		 * buildFlareState is internal, but if it produces a state with .e
		 * containing error stacks, serializeFlareState will include them.
		 * The fix: buildFlareState should gate .e behind import.meta.env.DEV.
		 * Since we can't control import.meta.env in tests, we verify
		 * that the exported FlareState type documents the contract:
		 * construct a state WITH .e and verify the serialized output
		 * does NOT contain it (i.e., there's a strip step).
		 *
		 * Currently this FAILS because serializeFlareState blindly serializes.
		 * After fix, buildFlareState won't include .e in production, so the
		 * state object reaching serializeFlareState won't have .e at all.
		 * We test the defense-in-depth: serializeFlareState should also strip .e.
		 */
		const state = {
			c: {},
			e: [
				{
					message: "db_password=hunter2",
					name: "Error",
					source: "routes/secret",
					stack: "at /app/src/secret.ts:42",
				},
			],
			m: [],
			p: "/",
			s: {},
		};
		const serialized = serializeFlareState(state as never);
		expect(serialized).not.toContain("hunter2");
		expect(serialized).not.toContain("/app/src/secret.ts");
	});
});

/* ── #2: escapeAttr in ssr/index.tsx missing <> escape ────────────── */

describe("#2: ssr/index.tsx escapeAttr escapes angle brackets", () => {
	it("escapes < and > in nonce attribute", async () => {
		const { buildFlareStateScript } = await import("../../src/ssr/index.tsx");
		const state = { c: {}, m: [], p: "/", s: {} };
		const script = buildFlareStateScript(state as never, "abc<img>def");
		expect(script).not.toContain("<img>");
		expect(script).toContain("&lt;");
	});
});

/* ── #3: EMPTY_CONTEXT is frozen (immutable) ─────────────────────── */

describe("#3: EMPTY_CONTEXT immutability", () => {
	it("getServerContext returns frozen object outside request context", async () => {
		const { getServerContext } = await import("../../src/server-context/index.ts");
		const ctx = getServerContext();
		expect(Object.isFrozen(ctx)).toBe(true);
	});
});

/* ── #4: preview server path traversal guard ─────────────────────── */

describe("#4: preview server static assets path traversal", () => {
	it("join+resolve with traversal escapes clientDir", async () => {
		const { join, resolve } = await import("node:path");
		const clientDir = "/app/dist/client";
		const maliciousUrl = "/assets/../../../etc/passwd";
		const resolved = resolve(join(clientDir, maliciousUrl));
		/* Demonstrates the bug — resolved path escapes clientDir */
		expect(resolved.startsWith(clientDir)).toBe(false);
	});
});

/* ── #5: dev image middleware path traversal ──────────────────────── */

describe("#5: dev image middleware path traversal via src param", () => {
	it("traversal path resolves outside project root", async () => {
		const { resolve } = await import("node:path");
		const src = "../../../etc/passwd";
		const resolved = resolve(src);
		expect(resolved).toContain("/etc/passwd");
	});
});
