import { expect, it } from "vitest";
import { createBoundaries } from "./boundaries.ts";

it("boundary once", () => {
	const render = () => "fallback";
	expect(() => createBoundaries().errorRender(render).errorRender(render)).toThrow(/errorRender/);
});
