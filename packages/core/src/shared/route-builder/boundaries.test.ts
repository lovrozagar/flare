import { expect, it } from "vitest";
import { createLayout } from "./layout.ts";
import { createPage } from "./page.ts";
import { createRootLayout } from "./root-layout.ts";

const render = (): string => "page";
const fallback = (): string => "fallback";
const missing = (): string => "missing";

it("boundary once", () => {
	const page = createPage("_root_/").render(render);
	expect(() => page.errorRender(fallback).errorRender(fallback)).toThrow(/errorRender twice/);
	expect(() => page.notFoundRender(missing).unauthorizedRender(fallback).notFoundRender(missing)).toThrow(
		/notFoundRender twice/,
	);
});

it("four kinds", () => {
	const builders = [createPage("_root_/a"), createLayout("_root_/a"), createRootLayout("_root_")];
	for (const builder of builders) {
		const bounded = builder
			.render(render)
			.errorRender(fallback)
			.notFoundRender(missing)
			.unauthenticatedRender(fallback)
			.unauthorizedRender(fallback);
		expect(bounded.render).toBe(render);
		expect(bounded.boundaries).toEqual({
			errorRender: fallback,
			notFoundRender: missing,
			unauthenticatedRender: fallback,
			unauthorizedRender: fallback,
		});
		expect(Object.keys(bounded)).not.toContain("errorRender");
	}
	expect(createPage("_root_/").render(render)).not.toHaveProperty("boundaries");
});
