import { expect, it } from "vitest";
import { createBoundaries } from "./boundaries.ts";

const render = (): string => "fallback";

it("boundary once", () => {
	expect(() => createBoundaries().errorRender(render).errorRender(render)).toThrow(/errorRender/);
});
