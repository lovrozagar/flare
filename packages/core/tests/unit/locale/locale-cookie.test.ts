import { describe, expect, it } from "vitest";
import { formatLocaleCookie } from "../../../src/locale/cookie.ts";

describe("formatLocaleCookie", () => {
	it("writes Path, Max-Age, SameSite=Lax", () => {
		expect(formatLocaleCookie("hr")).toBe("flare.locale=hr; Path=/; Max-Age=31536000; SameSite=Lax");
	});

	it("adds Secure on HTTPS", () => {
		expect(formatLocaleCookie("hr", "flare.locale", { https: true })).toContain("; Secure");
	});

	it("omits Secure on HTTP", () => {
		expect(formatLocaleCookie("hr", "flare.locale", { https: false })).not.toContain("Secure");
	});

	it("secure: true forces Secure on HTTP", () => {
		expect(formatLocaleCookie("en", "flare.locale", { https: false, secure: true })).toContain("; Secure");
	});

	it("secure: false omits Secure on HTTPS", () => {
		expect(formatLocaleCookie("en", "flare.locale", { https: true, secure: false })).not.toContain("Secure");
	});

	it("uses a custom cookie name", () => {
		expect(formatLocaleCookie("fr", "my-locale")).toContain("my-locale=fr");
	});

	it("rejects cookieName with CRLF (header injection)", () => {
		const header = formatLocaleCookie("en", "flare\r\nSet-Cookie: evil=1");
		expect(header).not.toContain("\r");
		expect(header).not.toContain("\n");
		expect(header.startsWith("flare.locale=en")).toBe(true);
	});

	it("strips CRLF and semicolons from the locale value", () => {
		const header = formatLocaleCookie("en\r\nSet-Cookie: x=1; Domain=evil.com");
		expect(header).not.toContain("\r");
		expect(header).not.toContain("\n");
		expect(header).not.toContain("; Domain");
	});
});
