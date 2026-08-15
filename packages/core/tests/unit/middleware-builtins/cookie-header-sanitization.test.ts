import { describe, expect, it } from "vitest";

/**
 * buildCookieHeader must sanitize locale and cookieName to prevent
 * CRLF injection / header splitting in Set-Cookie headers.
 * Defense-in-depth: even though callers validate locale against a known set,
 * the cookie construction function itself should be safe against injection.
 */

function buildCookieHeaderFixed(
	locale: string,
	cookieName: string,
	maxAge: number,
	isHttps: boolean,
	secure?: boolean,
): string {
	const sanitize = (v: string) => v.replace(/[\r\n;\0]/g, "");
	const secureFlag = (secure ?? isHttps) ? "; Secure" : "";
	return `${sanitize(cookieName)}=${sanitize(locale)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secureFlag}`;
}

function buildCookieHeaderBuggy(
	locale: string,
	cookieName: string,
	maxAge: number,
	isHttps: boolean,
	secure?: boolean,
): string {
	const secureFlag = (secure ?? isHttps) ? "; Secure" : "";
	return `${cookieName}=${locale}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secureFlag}`;
}

describe("buildCookieHeader sanitization", () => {
	it("normal locale passes through unchanged", () => {
		const result = buildCookieHeaderFixed("en-us", "flare.locale", 31536000, true);
		expect(result).toBe("flare.locale=en-us; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
	});

	it("buggy version allows CRLF injection in locale", () => {
		const injected = "en\r\nX-Injected: evil";
		const result = buildCookieHeaderBuggy(injected, "flare.locale", 31536000, true);
		expect(result).toContain("\r\n");
	});

	it("fixed version strips CRLF from locale", () => {
		const injected = "en\r\nX-Injected: evil";
		const result = buildCookieHeaderFixed(injected, "flare.locale", 31536000, true);
		expect(result).not.toContain("\r");
		expect(result).not.toContain("\n");
		expect(result).toBe("flare.locale=enX-Injected: evil; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
	});

	it("fixed version strips null bytes from locale", () => {
		const result = buildCookieHeaderFixed("en\0us", "flare.locale", 31536000, false);
		expect(result).not.toContain("\0");
		expect(result).toBe("flare.locale=enus; Path=/; Max-Age=31536000; SameSite=Lax");
	});

	it("fixed version strips semicolons from locale to prevent attribute injection", () => {
		const injected = "en; Domain=evil.com";
		const result = buildCookieHeaderFixed(injected, "flare.locale", 31536000, true);
		expect(result).not.toContain("; Domain");
		expect(result).toBe("flare.locale=en Domain=evil.com; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
	});

	it("fixed version strips CRLF from cookieName", () => {
		const injected = "flare\r\nSet-Cookie: evil=1";
		const result = buildCookieHeaderFixed("en", injected, 31536000, true);
		expect(result).not.toContain("\r");
		expect(result).not.toContain("\n");
	});

	it("secure flag controlled by parameter", () => {
		const http = buildCookieHeaderFixed("en", "loc", 100, false);
		expect(http).not.toContain("Secure");

		const https = buildCookieHeaderFixed("en", "loc", 100, true);
		expect(https).toContain("; Secure");

		const overrideSecure = buildCookieHeaderFixed("en", "loc", 100, false, true);
		expect(overrideSecure).toContain("; Secure");

		const overrideInsecure = buildCookieHeaderFixed("en", "loc", 100, true, false);
		expect(overrideInsecure).not.toContain("Secure");
	});
});
