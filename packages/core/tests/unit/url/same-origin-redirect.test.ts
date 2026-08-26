import { describe, expect, it } from "vitest";
import { sameOriginRedirectPath } from "../../../src/url/index.ts";

describe("sameOriginRedirectPath", () => {
	it("keeps a normal path and search", () => {
		expect(sameOriginRedirectPath(new URL("http://localhost/about?x=1"))).toBe("/about?x=1");
	});

	it("rejects protocol-relative pathname", () => {
		expect(sameOriginRedirectPath(new URL("http://localhost//evil.com"))).toBe("/");
	});

	it("rejects a pathname with extra leading slashes that would be protocol-relative", () => {
		expect(sameOriginRedirectPath(new URL("http://localhost///evil.com/phish"))).toBe("/");
	});

	it("rejects a pathname with CR or LF (header injection)", () => {
		const url = new URL("http://localhost/about");
		Object.defineProperty(url, "pathname", { value: "/about\r\nLocation: https://evil.com" });
		expect(sameOriginRedirectPath(url)).toBe("/");
	});
});
