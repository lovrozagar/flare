import { describe, expect, it } from "vitest";

/**
 * Service worker keepalive path check uses indexOf which matches substrings.
 * Should use exact match === since the keepalive endpoint is a fixed path.
 */

function shouldPassthroughFixed(pathname: string): boolean {
	return pathname === "/_flare/keepalive";
}

function shouldPassthroughBuggy(pathname: string): boolean {
	return pathname.indexOf("/_flare/keepalive") !== -1;
}

describe("SW keepalive path matching", () => {
	it("exact keepalive path passes through in both versions", () => {
		expect(shouldPassthroughFixed("/_flare/keepalive")).toBe(true);
		expect(shouldPassthroughBuggy("/_flare/keepalive")).toBe(true);
	});

	it("buggy version matches keepalive as substring in arbitrary paths", () => {
		expect(shouldPassthroughBuggy("/admin/_flare/keepalive")).toBe(true);
		expect(shouldPassthroughBuggy("/nested/path/_flare/keepalive")).toBe(true);
	});

	it("fixed version rejects keepalive as substring", () => {
		expect(shouldPassthroughFixed("/admin/_flare/keepalive")).toBe(false);
		expect(shouldPassthroughFixed("/nested/path/_flare/keepalive")).toBe(false);
	});

	it("buggy version matches keepalive with suffix", () => {
		expect(shouldPassthroughBuggy("/_flare/keepalive-extended")).toBe(true);
		expect(shouldPassthroughBuggy("/_flare/keepalive/sub")).toBe(true);
	});

	it("fixed version rejects keepalive with suffix", () => {
		expect(shouldPassthroughFixed("/_flare/keepalive-extended")).toBe(false);
		expect(shouldPassthroughFixed("/_flare/keepalive/sub")).toBe(false);
	});

	it("non-keepalive paths are not matched in either version", () => {
		expect(shouldPassthroughFixed("/")).toBe(false);
		expect(shouldPassthroughFixed("/assets/main.js")).toBe(false);
		expect(shouldPassthroughFixed("/_flare/server-fn/myFunction")).toBe(false);
		expect(shouldPassthroughBuggy("/")).toBe(false);
		expect(shouldPassthroughBuggy("/assets/main.js")).toBe(false);
		expect(shouldPassthroughBuggy("/_flare/server-fn/myFunction")).toBe(false);
	});
});
