/**
 * Iteration 10 — TDD red-phase tests for security/perf audit.
 * All tests should FAIL before fixes are applied.
 */
import { describe, expect, it } from "vitest";

/* ── #1: testing waitForFunction code injection ─────────────────────── */

describe("#1: testing waitForFunction code injection", () => {
	it("source uses function-based waitForFunction, not string interpolation", async () => {
		const { readFileSync } = await import("node:fs");
		const { resolve } = await import("node:path");
		const source = readFileSync(resolve(__dirname, "../../src/testing/index.ts"), "utf-8");
		/* Should NOT have unescaped string interpolation in waitForFunction */
		expect(source).not.toMatch(/waitForFunction\(`[^`]*\$\{path\}/);
	});
});

/* ── #2: containsDeferredMarkers unbounded recursion depth ──────────── */

describe("#2: containsDeferredMarkers depth limit", () => {
	it("source has a depth parameter or MAX_DEPTH guard", async () => {
		const { readFileSync } = await import("node:fs");
		const { resolve } = await import("node:path");
		const source = readFileSync(resolve(__dirname, "../../src/ndjson-client/index.ts"), "utf-8");
		/* Should have depth limiting in containsDeferredMarkers */
		expect(source).toMatch(/containsDeferredMarkers.*depth|MAX_DEFERRED_DEPTH/);
	});
});

/* ── #3: NDJSON stream message count limit ──────────────────────────── */

describe("#3: NDJSON stream message count limit", () => {
	it("source has a message count limit in the stream reader", async () => {
		const { readFileSync } = await import("node:fs");
		const { resolve } = await import("node:path");
		const source = readFileSync(resolve(__dirname, "../../src/ndjson-client/index.ts"), "utf-8");
		/* Should have MAX_MESSAGES or messageCount guard */
		expect(source).toMatch(/MAX_MESSAGES|messageCount|maxMessages/);
	});
});
