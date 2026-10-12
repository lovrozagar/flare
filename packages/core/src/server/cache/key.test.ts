import { expect, expectTypeOf, it, vi } from "vitest";
import * as keys from "./key.ts";
import { buildId, storeKey, type KeyInput } from "./key.ts";

// The policy class and the search change nothing: the key has no slot for either (B32, B73).
it("shape", () => {
	expect(storeKey({ build: "b", route: "home", pattern: "/[id]", params: { id: "042" }, class: "anonymous" })).toBe(
		"static:b:home:042",
	);
	expect(storeKey({ build: "b", route: "_root_/about", pattern: "/about", params: {}, class: "anonymous" })).toBe(
		"static:b:_root_/about",
	);
	expectTypeOf<KeyInput>().not.toHaveProperty("search");
	// Route-order values join with `/`.
	expect(
		storeKey({ build: "b", route: "r", pattern: "/[a]/[b]", params: { a: "1", b: "2" }, class: "anonymous" }),
	).toBe("static:b:r:1/2");
});

it("catch all", () => {
	expect(
		storeKey({
			build: "b",
			route: "docs",
			pattern: "/docs/[...path]",
			params: { path: ["a", "b"] },
			class: "anonymous",
		}),
	).toBe("static:b:docs:a/b");
});

it("encode", () => {
	expect(storeKey({ build: "b", route: "r", pattern: "/[id]", params: { id: "a/b%c" }, class: "anonymous" })).toBe(
		"static:b:r:a%2Fb%25c",
	);
	expect(
		storeKey({ build: "b", route: "r", pattern: "/[...path]", params: { path: ["x/y", "z"] }, class: "anonymous" }),
	).toBe("static:b:r:x%2Fy/z");
});

// A required chain is never stored (B27), so it has no key.
it("required", () => {
	expect(() => storeKey({ build: "b", route: "r", pattern: "/", params: {}, class: "required" })).toThrow(/required/);
});

// The framework builds the key. Nothing the module exports takes one from the author (B32).
it("no callback", () => {
	expect(Object.keys(keys).toSorted()).toEqual(["buildId", "storeKey"]);
	expectTypeOf<KeyInput>().not.toHaveProperty("key");
});

// `flare()` defines the build id. Without the plugin it is `dev` (dx/plugin.md).
it("build id", () => {
	expect(buildId()).toBe("dev");
	vi.stubEnv("FLARE_BUILD_ID", "abc123");
	expect(buildId()).toBe("abc123");
	vi.unstubAllEnvs();
});

// The order is the route's declared params, never the record's: the matcher builds the record innermost first.
it("route order", () => {
	expect(
		storeKey({ build: "b", route: "r", pattern: "/[a]/[b]", params: { b: "two", a: "one" }, class: "anonymous" }),
	).toBe("static:b:r:one/two");
});

const optionals = (params: Record<string, string | string[] | undefined>): string =>
	storeKey({ build: "b", route: "r", pattern: "/[[a]]/static/[[b]]", params, class: "anonymous" });

// Every declared param keeps its slot. An absent optional, or an undefined value, is the empty string.
it("absent optional", () => {
	expect(optionals({ b: "x" })).toBe("static:b:r:/x");
	expect(optionals({ a: "x" })).toBe("static:b:r:x/");
	expect(optionals({ a: undefined, b: "x" })).toBe("static:b:r:/x");
	expect(optionals({})).toBe("static:b:r:/");
	expect(storeKey({ build: "b", route: "r", pattern: "/[[...rest]]", params: {}, class: "anonymous" })).toBe(
		"static:b:r:",
	);
});
