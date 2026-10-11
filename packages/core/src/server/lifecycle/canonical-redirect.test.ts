import { expect, it } from "vitest";
import { applyCanonical } from "./canonical-redirect.ts";

it("once", () => {
	expect(applyCanonical({ url: "/A/", trailingSlash: "never", caseSensitive: false })).toEqual({
		status: 301,
		location: "/a",
	});
});

it("rewrite recanonical", () => {
	let calls = 0;
	const result = applyCanonical({
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
		url: "/old",
		rewrite(path) {
			seen = path;
			return undefined;
		},
	});
	expect(seen).toBe("/old");
	// @ts-expect-error a location object is not a pathname
	applyCanonical({ url: "/old", rewrite: () => ({ pathname: "/new", search: "", hash: "" }) });
});

it("search kept", () => {
	const result = applyCanonical({ url: "/About?q=1&q=2#top", caseSensitive: false });
	expect(result).toEqual({ status: 301, location: "/about?q=1&q=2" });
	expect(result.location).not.toContain("#");
});
