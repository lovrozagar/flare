import { expect, it } from "vitest";
import { applySecurity, mergeHeaders } from "./apply.ts";

const url = "https://example.com/";

it("overwrites", () => {
	const result = applySecurity({
		url,
		headers: new Headers({ "content-security-policy": "stored" }),
	});
	const policy = result.headers.get("content-security-policy") ?? "";
	expect(policy).toContain(`'nonce-${result.nonce}'`);
	expect(policy).not.toContain("stored");
});

it("route security", () => {
	const result = applySecurity({
		url,
		headers: new Headers(),
		route: { "X-Frame-Options": "SAMEORIGIN" },
	});
	expect(result.headers.get("x-frame-options")).toBe("SAMEORIGIN");
});

it("callback override", () => {
	const result = applySecurity({
		url,
		headers: new Headers(),
		security: () => ({ "X-Frame-Options": "SAMEORIGIN" }),
	});
	expect(result.headers.get("x-frame-options")).toBe("SAMEORIGIN");
});

it("false removes", () => {
	const result = applySecurity({
		url,
		headers: new Headers(),
		route: { "X-Frame-Options": false },
	});
	expect(result.headers.has("x-frame-options")).toBe(false);
});

it("headers() cannot", () => {
	const result = applySecurity({
		url,
		headers: new Headers(),
		routeHeaders: { "Content-Security-Policy": "from-headers" },
		security: { "Content-Security-Policy": "from-security" },
	});
	expect(result.headers.get("content-security-policy")).toBe("from-security");
});

it("both cookies", () => {
	const merged = mergeHeaders(
		{ "set-cookie": "a", "x-other": "parent", "x-keep": "stay" },
		{ "set-cookie": "b", "x-other": "child", "x-keep": undefined },
	);
	expect(merged["set-cookie"]).toEqual(["a", "b"]);
	expect(merged["x-other"]).toBe("child");
	expect(merged["x-keep"]).toBe("stay");
	expect(mergeHeaders({ "set-cookie": "a" }, { "set-cookie": undefined })["set-cookie"]).toBe("a");
	expect(mergeHeaders({ "x-other": "parent" }, { "set-cookie": "b" })["set-cookie"]).toBe("b");
});

// Dev adds what Vite's client needs, such as its ping worker's blob: URL. Production keeps worker-src 'self'.
it("dev policy", () => {
	const worker = (dev?: boolean): string | undefined => {
		const result = applySecurity({ url, headers: new Headers(), ...(dev !== undefined && { dev }) });
		return /worker-src ([^;]*)/.exec(result.headers.get("content-security-policy") ?? "")?.[1];
	};
	expect(worker(true)).toBe("'self' blob:");
	expect(worker(false)).toBe("'self'");
	expect(worker()).toBe("'self'");
});
