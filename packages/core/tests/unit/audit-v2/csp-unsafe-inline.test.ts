import { describe, expect, it } from "vitest";
import { buildCspHeader, DEFAULT_CSP } from "../../../src/security/index.ts";

describe("CSP — style-src must not include unsafe-inline", () => {
	it("DEFAULT_CSP style-src does not contain 'unsafe-inline'", () => {
		const styleSrc = DEFAULT_CSP["style-src"];
		expect(styleSrc).not.toContain("'unsafe-inline'");
	});

	it("buildCspHeader() production output has no unsafe-inline in style-src", () => {
		const header = buildCspHeader("test-nonce", undefined, false);
		const styleSrcMatch = header.match(/style-src\s+([^;]*)/);
		expect(styleSrcMatch).toBeTruthy();
		expect(styleSrcMatch?.[1]).not.toContain("'unsafe-inline'");
	});

	it("buildCspHeader() default (no isDev) has no unsafe-inline in style-src", () => {
		const header = buildCspHeader("test-nonce");
		const styleSrcMatch = header.match(/style-src\s+([^;]*)/);
		expect(styleSrcMatch).toBeTruthy();
		expect(styleSrcMatch?.[1]).not.toContain("'unsafe-inline'");
	});

	it("production allows Solid 2 CSSOM style writes via style-src-attr", () => {
		const header = buildCspHeader("test-nonce", undefined, false);
		expect(header).toContain("style-src-attr 'unsafe-inline'");
		const styleSrcMatch = header.match(/(?:^|;)\s*style-src\s+([^;]*)/);
		expect(styleSrcMatch?.[1]).not.toContain("'unsafe-inline'");
	});
});
