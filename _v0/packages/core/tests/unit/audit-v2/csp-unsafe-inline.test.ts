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

	it("production puts the style nonce on style-src-elem, not style-src", () => {
		const header = buildCspHeader("test-nonce", undefined, false);
		const styleSrc = header.match(/(?:^|;)\s*style-src\s+([^;]*)/)?.[1] ?? "";
		const styleSrcElem = header.match(/style-src-elem\s+([^;]*)/)?.[1] ?? "";
		expect(styleSrc).not.toContain("nonce-");
		expect(styleSrcElem).toContain("'nonce-test-nonce'");
		expect(styleSrcElem).not.toContain("'unsafe-inline'");
	});
});

describe("CSP — app style-src sources reach the synthesized style-src-elem", () => {
	it("style-src hosts also allow stylesheets, next to the nonce", () => {
		const header = buildCspHeader("test-nonce", { "style-src": ["https://client.crisp.chat"] }, false);
		const styleSrcElem = header.match(/style-src-elem\s+([^;]*)/)?.[1] ?? "";
		expect(styleSrcElem.split(" ")).toEqual(["'self'", "https://client.crisp.chat", "'nonce-test-nonce'"]);
	});

	it("an explicit style-src-elem override is not widened by style-src", () => {
		const header = buildCspHeader(
			"test-nonce",
			{ "style-src": ["https://a.example"], "style-src-elem": ["https://b.example"] },
			false,
		);
		const styleSrcElem = header.match(/style-src-elem\s+([^;]*)/)?.[1] ?? "";
		expect(styleSrcElem.split(" ")).toEqual(["'self'", "https://b.example", "'nonce-test-nonce'"]);
	});
});
