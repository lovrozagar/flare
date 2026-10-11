import { expect, it } from "vitest";
import { canonicalRedirect } from "./builder.ts";

it("GET canonical", () => {
	expect(canonicalRedirect({ method: "GET", path: "/a//b" })).toEqual({
		status: 301,
		location: "/a/b",
		method: "GET",
	});
	expect(canonicalRedirect({ method: "HEAD", path: "/a//b" }).status).toBe(301);
});

it("POST canonical", () => {
	expect(canonicalRedirect({ method: "POST", path: "/a//b" })).toEqual({
		status: 308,
		location: "/a/b",
		method: "POST",
	});
});

it("hostile is 400", () => {
	const result = canonicalRedirect({ method: "GET", path: "//evil" });
	expect(result.status).toBe(400);
	expect(result).not.toHaveProperty("location");
});

it("always", () => {
	expect(canonicalRedirect({ method: "GET", path: "/about", trailingSlash: "always" })).toEqual({
		status: 301,
		location: "/about/",
		method: "GET",
	});
	expect(canonicalRedirect({ method: "GET", path: "/about/", trailingSlash: "always" })).toEqual({
		status: 200,
		path: "/about/",
	});
});

it("preserve both", () => {
	expect(canonicalRedirect({ method: "GET", path: "/about", trailingSlash: "preserve" })).toEqual({
		status: 200,
		path: "/about",
	});
	expect(canonicalRedirect({ method: "GET", path: "/about/", trailingSlash: "preserve" })).toEqual({
		status: 200,
		path: "/about/",
	});
});

it("no double slash", () => {
	expect(canonicalRedirect({ method: "GET", path: "/", trailingSlash: "always" })).toEqual({
		status: 200,
		path: "/",
	});
	const folded = canonicalRedirect({ method: "GET", path: "/a//b", trailingSlash: "always" });
	expect(folded).toEqual({ status: 301, location: "/a/b/", method: "GET" });
	expect(folded).not.toEqual(expect.objectContaining({ location: "//" }));
});
