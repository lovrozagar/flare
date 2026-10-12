import { expect, it } from "vitest";
import { transitionDirection } from "./direction.ts";

it("forward", () => {
	expect(transitionDirection({ from: 2, to: 3, enabled: true })).toBe("forward");
	expect(transitionDirection({ from: 2, to: 2, enabled: true })).toBe("same");
});

it("back", () => {
	expect(transitionDirection({ from: 3, to: 1, enabled: true })).toBe("back");
});

it("off", () => {
	expect(transitionDirection({ from: 2, to: 3, enabled: false })).toBeUndefined();
});
