import { expect, it } from "vitest";
import { applyCanonical } from "./canonical-redirect.ts";

it("once", () => {
	expect(applyCanonical({ method: "GET", url: "/A/", trailingSlash: "never", caseSensitive: false })).toEqual({
		status: 301,
		location: "/a",
	});
});

it("rewrite recanonical", () => {
	let calls = 0;
	const result = applyCanonical({
		method: "GET",
		url: "/old",
		trailingSlash: "never",
		caseSensitive: false,
		rewrite(path) {
			calls += 1;
			return path === "/old" ? "/A/" : "/elsewhere";
		},
	});
	expect(calls).toBe(1);
	expect(result).toEqual({ status: 301, location: "/a" });
});

it("path string", () => {
	let seen = "";
	applyCanonical({
		method: "GET",
		url: "/old",
		rewrite(path) {
			seen = path;
			return undefined;
		},
	});
	expect(seen).toBe("/old");
	// @ts-expect-error a location object is not a pathname
	applyCanonical({ method: "GET", url: "/old", rewrite: () => ({ pathname: "/new", search: "", hash: "" }) });
});

it("hostile", () => {
	const result = applyCanonical({ method: "GET", url: "/%2f" });
	expect(result.status).toBe(400);
	expect(result).not.toHaveProperty("location");
	const rewritten = applyCanonical({ method: "GET", url: "/old", rewrite: () => "/%2f" });
	expect(rewritten.status).toBe(400);
	expect(rewritten).not.toHaveProperty("location");
});

it("search kept", () => {
	const result = applyCanonical({ method: "GET", url: "/About?q=1&q=2#top", caseSensitive: false });
	expect(result).toEqual({ status: 301, location: "/about?q=1&q=2" });
	expect(result.location).not.toContain("#");
});

it("method kept", () => {
	expect(applyCanonical({ method: "HEAD", url: "/A", caseSensitive: false })).toEqual({ status: 301, location: "/a" });
	for (const method of ["POST", "PUT", "DELETE"]) {
		expect(applyCanonical({ method, url: "/A?x=1", caseSensitive: false })).toEqual({
			status: 308,
			location: "/a?x=1",
		});
	}
});

it("fn path exempt", () => {
	const options = { method: "POST", trailingSlash: "always" as const, caseSensitive: false };
	expect(applyCanonical({ ...options, url: "/_flare/fn/0123456789ABCDEF" })).toEqual({ status: 200 });
	expect(applyCanonical({ ...options, url: "/_flare/fn/%2f" }).status).toBe(400);
	expect(applyCanonical({ ...options, url: "/About" })).toEqual({ status: 308, location: "/about/" });
	const based = { ...options, basePath: "/app" };
	expect(applyCanonical({ ...based, url: "/app/_flare/fn/0123456789ABCDEF" })).toEqual({ status: 200 });
	expect(applyCanonical({ ...based, url: "/_flare/fn/0123456789ABCDEF" })).toEqual({
		status: 308,
		location: "/_flare/fn/0123456789abcdef/",
	});
});
