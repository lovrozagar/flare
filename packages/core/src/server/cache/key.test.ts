import { expect, expectTypeOf, it, vi } from "vitest";
import * as keys from "./key.ts";
import { buildId, storeKey, type KeyInput } from "./key.ts";

// The policy class and the search change nothing: the key has no slot for either (B32, B73).
it("shape", () => {
	expect(storeKey({ build: "b", route: "home", params: { id: "042" }, class: "anonymous" })).toBe("static:b:home:042");
	expect(storeKey({ build: "b", route: "_root_/about", params: {}, class: "anonymous" })).toBe("static:b:_root_/about");
	expectTypeOf<KeyInput>().not.toHaveProperty("search");
	// Route-order values join with `/`.
	expect(storeKey({ build: "b", route: "r", params: { a: "1", b: "2" }, class: "anonymous" })).toBe("static:b:r:1/2");
});

it("catch all", () => {
	expect(storeKey({ build: "b", route: "docs", params: { path: ["a", "b"] }, class: "anonymous" })).toBe(
		"static:b:docs:a/b",
	);
});

it("encode", () => {
	expect(storeKey({ build: "b", route: "r", params: { id: "a/b%c" }, class: "anonymous" })).toBe(
		"static:b:r:a%2Fb%25c",
	);
	expect(storeKey({ build: "b", route: "r", params: { path: ["x/y", "z"] }, class: "anonymous" })).toBe(
		"static:b:r:x%2Fy/z",
	);
});

// A required chain is never stored (B27), so it has no key.
it("required", () => {
	expect(() => storeKey({ build: "b", route: "r", params: {}, class: "required" })).toThrow(/required/);
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
