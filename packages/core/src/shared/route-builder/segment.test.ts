import { expect, it } from "vitest";
import { createPathSegment } from "./segment.ts";

const children = { node: "child" };
const cdn = { cdn: { maxAge: "1m" } };

it("identity render", () => {
	expect(createPathSegment("_root_/seg").render(children)).toBe(children);
});

it("cache only", () => {
	expect(createPathSegment("_root_/seg").cache(cdn).cache).toEqual(cdn);
});

it("no loader", () => {
	expect(Object.keys(createPathSegment("_root_/seg"))).not.toContain("loader");
});
