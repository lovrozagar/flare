import { expect, it } from "vitest";
import { checkCsrf, type CsrfInput } from "./csrf.ts";

const origin = "https://app.example.com";

function check(headers: Record<string, string>, extra: Partial<CsrfInput> = {}): number {
	return checkCsrf({
		method: "post",
		headers: new Headers(headers),
		origin,
		sameSite: [],
		identity: false,
		...extra,
	});
}

it("same origin", () => {
	expect(check({ origin })).toBe(200);
	expect(check({ "sec-fetch-site": "same-origin" })).toBe(200);
	expect(check({ referer: `${origin}/page` })).toBe(200);
});

it("cross site", () => {
	expect(check({ "sec-fetch-site": "cross-site" })).toBe(403);
	expect(check({ origin: "https://evil.example" })).toBe(403);
	expect(check({ referer: "https://evil.example/page" })).toBe(403);
	expect(check({ origin: "null" })).toBe(403);
});

it("same site listed", () => {
	const listed = { sameSite: ["blog.example.com"] };
	expect(check({ "sec-fetch-site": "same-site", referer: "https://blog.example.com/post" }, listed)).toBe(200);
	expect(check({ origin: "https://blog.example.com" }, listed)).toBe(200);
	expect(check({ referer: "https://blog.example.com/post" }, listed)).toBe(200);
});

it("same site unlisted", () => {
	expect(check({ "sec-fetch-site": "same-site", referer: "https://blog.example.com/post" })).toBe(403);
	expect(check({ "sec-fetch-site": "same-site" }, { sameSite: ["blog.example.com"] })).toBe(403);
	expect(check({ "sec-fetch-site": "same-site", referer: "not a url" }, { sameSite: ["blog.example.com"] })).toBe(403);
});

it("none is GET only", () => {
	expect(check({ "sec-fetch-site": "none" })).toBe(403);
});

it("none on GET", () => {
	expect(check({ "sec-fetch-site": "none" }, { method: "get" })).toBe(200);
});

it("fail open", () => {
	expect(check({})).toBe(200);
});

it("fail closed", () => {
	expect(check({}, { identity: true })).toBe(403);
});

it("origin wins", () => {
	expect(check({ origin: "https://evil.example", "sec-fetch-site": "same-origin", referer: `${origin}/` })).toBe(403);
	expect(check({ "sec-fetch-site": "cross-site", referer: `${origin}/` })).toBe(403);
	expect(check({ "sec-fetch-site": "unknown-value" })).toBe(403);
});
