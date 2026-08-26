/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { executeRewriteInput, executeRewriteOutput } from "../../../src/rewrite/index.ts";

/**
 * Bug 62: executeRewriteInput crashes on relative path strings
 *
 * new URL("/foo") without a base throws TypeError: Invalid URL.
 * Rewrite functions may return relative paths like "/rewritten".
 */

describe("Bug 62: rewrite with relative path strings", () => {
	it("executeRewriteInput should handle relative path string", () => {
		const url = new URL("http://example.com/original");
		const rewrite = {
			input: () => "/rewritten",
		};

		const result = executeRewriteInput(rewrite, url);
		expect(result.pathname).toBe("/rewritten");
		expect(result.origin).toBe("http://example.com");
	});

	it("executeRewriteOutput should handle relative path string", () => {
		const url = new URL("http://example.com/internal");
		const rewrite = {
			output: () => "/external-path",
		};

		const result = executeRewriteOutput(rewrite, url);
		expect(result.pathname).toBe("/external-path");
		expect(result.origin).toBe("http://example.com");
	});

	it("keeps the original origin when a rewrite string is cross-origin", () => {
		const url = new URL("http://example.com/original");
		const rewrite = {
			input: () => "http://other.com/path",
		};

		const result = executeRewriteInput(rewrite, url);
		expect(result.origin).toBe("http://example.com");
		expect(result.href).toBe(url.href);
	});

	it("does not follow protocol-relative rewrite strings", () => {
		const url = new URL("http://example.com/original");
		const rewrite = {
			input: () => "//evil.com/x",
		};

		const result = executeRewriteInput(rewrite, url);
		expect(result.origin).toBe("http://example.com");
		expect(result.href).toBe(url.href);
	});
});
