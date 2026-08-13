/**
 * Iteration 6 — TDD red-phase tests for security/perf audit.
 * All tests should FAIL before fixes are applied.
 */
import { describe, expect, it } from "vitest"

/* ── #1: RedirectResponse tab/newline bypass ──────────────────────── */

describe("#1: RedirectResponse embedded control character bypass", () => {
	it("blocks javascript: with embedded tab", async () => {
		const { RedirectResponse } = await import("../../src/errors/index.ts")
		expect(() => new RedirectResponse({ href: "java\tscript:alert(1)" })).toThrow(
			"Unsafe redirect URL",
		)
	})

	it("blocks javascript: with embedded newline", async () => {
		const { RedirectResponse } = await import("../../src/errors/index.ts")
		expect(() => new RedirectResponse({ href: "java\nscript:alert(1)" })).toThrow(
			"Unsafe redirect URL",
		)
	})

	it("blocks javascript: with embedded carriage return", async () => {
		const { RedirectResponse } = await import("../../src/errors/index.ts")
		expect(() => new RedirectResponse({ href: "java\rscript:alert(1)" })).toThrow(
			"Unsafe redirect URL",
		)
	})

	it("null byte in data: → safe (URL constructor treats as relative path)", async () => {
		const { RedirectResponse } = await import("../../src/errors/index.ts")
		/* \0 breaks the protocol name — URL constructor treats as path, not data: */
		expect(() => new RedirectResponse({ href: "da\0ta:text/html,<script>" })).not.toThrow()
	})
})

/* ── #2: parseSearchParams prototype pollution ────────────────────── */

describe("#2: parseSearchParams prototype pollution guard", () => {
	it("filters __proto__ key from search params", async () => {
		const { parseSearchParams } = await import("../../src/url/index.ts")
		const sp = new URLSearchParams("__proto__=polluted&foo=bar")
		const result = parseSearchParams(sp)
		expect(result.foo).toBe("bar")
		expect("__proto__" in result).toBe(false)
	})

	it("filters constructor key from search params", async () => {
		const { parseSearchParams } = await import("../../src/url/index.ts")
		const sp = new URLSearchParams("constructor=bad&foo=bar")
		const result = parseSearchParams(sp)
		expect(result.foo).toBe("bar")
		expect("constructor" in result).toBe(false)
	})

	it("filters prototype key from search params", async () => {
		const { parseSearchParams } = await import("../../src/url/index.ts")
		const sp = new URLSearchParams("prototype=evil&foo=bar")
		const result = parseSearchParams(sp)
		expect(result.foo).toBe("bar")
		expect("prototype" in result).toBe(false)
	})

	it("result has no inherited Object.prototype properties", async () => {
		const { parseSearchParams } = await import("../../src/url/index.ts")
		const sp = new URLSearchParams("foo=bar")
		const result = parseSearchParams(sp)
		expect(result.foo).toBe("bar")
		expect("toString" in result).toBe(false)
		expect("hasOwnProperty" in result).toBe(false)
	})
})

/* ── #3: isExternal returns false for //evil.com during SSR ───────── */

describe("#3: isExternal on server (no window)", () => {
	it("treats protocol-relative URLs as external when window is undefined", async () => {
		const savedWindow = globalThis.window
		delete (globalThis as Record<string, unknown>).window

		try {
			const { isExternal } = await import("../../src/navigation/index.ts")
			expect(isExternal("//evil.com/phishing")).toBe(true)
		} finally {
			if (savedWindow !== undefined) {
				;(globalThis as Record<string, unknown>).window = savedWindow
			}
		}
	})

	it("treats http:// URLs as external when window is undefined", async () => {
		const savedWindow = globalThis.window
		delete (globalThis as Record<string, unknown>).window

		try {
			const { isExternal } = await import("../../src/navigation/index.ts")
			expect(isExternal("http://evil.com/phishing")).toBe(true)
		} finally {
			if (savedWindow !== undefined) {
				;(globalThis as Record<string, unknown>).window = savedWindow
			}
		}
	})
})

/* ── #4: dedupe fnCounter overflow ────────────────────────────────── */

describe("#4: dedupe fnCounter wrap guard", () => {
	it("fnCounter wraps at MAX_SAFE_INTEGER", async () => {
		const { dedupe } = await import("../../src/dedupe/index.ts")
		const { runWithServerContext } = await import("../../src/server-context/index.ts")

		await runWithServerContext(
			{ nonce: "test", request: new Request("http://localhost") },
			async () => {
				const fn1 = dedupe(async (x: number) => x + 1)
				const fn2 = dedupe(async (x: number) => x + 2)

				const r1 = await fn1(1)
				const r2 = await fn2(1)
				expect(r1).toBe(2)
				expect(r2).toBe(3)
			},
		)
	})
})
