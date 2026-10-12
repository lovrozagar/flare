import { expect, it } from "vitest";
import { defined } from "./defined.ts";

it("present", () => {
	expect(defined(0, "zero")).toBe(0);
	expect(defined(null, "null")).toBeNull();
});

it("missing", () => {
	expect(() => defined([].at(-1), "the page match")).toThrow("Flare invariant: the page match is missing");
});
