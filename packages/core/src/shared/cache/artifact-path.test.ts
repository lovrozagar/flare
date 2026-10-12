import { expect, it } from "vitest";
import { artifactPath } from "./artifact-path.ts";

it("about", () => {
	expect(artifactPath("static:b:_root_/about", { build: "b" })).toBe("/assets/_flare-static/b/_root_%2Fabout.json");
});

it("params", () => {
	expect(artifactPath("static:b:home:042", { build: "b" })).toBe("/assets/_flare-static/b/home%3A042.json");
});

it("other build", () => {
	expect(artifactPath("static:other:home", { build: "b" })).toBeNull();
	expect(artifactPath("epoch:t", { build: "b" })).toBeNull();
});

it("empty tail", () => {
	expect(artifactPath("static:b:", { build: "b" })).toBeNull();
});

// The tail is one path segment: a route id's `/` and a param's `..` cannot climb out of the build directory.
it("one segment", () => {
	for (const key of ["static:b:_root_/(blog)/post:a%2F..%2Fx", "static:b:..", "static:b:a/../../x"]) {
		const path = artifactPath(key, { build: "b", base: "/cdn/_flare-static" }) ?? "";
		const after = path.slice("/cdn/_flare-static/b/".length);
		expect(path.startsWith("/cdn/_flare-static/b/")).toBe(true);
		expect(after).not.toContain("/");
		expect(after).not.toBe("..");
		expect(new URL(path, "http://assets").pathname.startsWith("/cdn/_flare-static/b/")).toBe(true);
	}
});
