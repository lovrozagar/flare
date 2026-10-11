import { expect, it } from "vitest";
import { defaultHeaders } from "./defaults.ts";

const httpsNames = [
	"cross-origin-opener-policy",
	"referrer-policy",
	"strict-transport-security",
	"x-content-type-options",
	"x-frame-options",
];

function names(url: string): string[] {
	return [...defaultHeaders(url).keys()].sort();
}

it("no powered by", () => {
	expect(defaultHeaders("https://example.com/").has("x-powered-by")).toBe(false);
	expect(defaultHeaders("http://localhost/").has("x-powered-by")).toBe(false);
});

it("hsts", () => {
	expect(defaultHeaders("https://example.com/").get("strict-transport-security")).toBe(
		"max-age=63072000; includeSubDomains",
	);
	expect(defaultHeaders("http://localhost/").get("strict-transport-security")).toBeNull();
});

it("nosniff", () => {
	expect(defaultHeaders("https://example.com/").get("x-content-type-options")).toBe("nosniff");
	expect(defaultHeaders("http://localhost/").get("x-content-type-options")).toBe("nosniff");
	expect(names("https://example.com/")).toEqual(httpsNames);
	expect(names("http://localhost/")).toEqual(httpsNames.filter((name) => name !== "strict-transport-security"));
});

it("referrer", () => {
	const headers = defaultHeaders("https://example.com/");
	expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
	expect(headers.get("x-frame-options")).toBe("DENY");
	expect(headers.get("cross-origin-opener-policy")).toBe("same-origin");
});
