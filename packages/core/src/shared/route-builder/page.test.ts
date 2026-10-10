import { expect, it } from "vitest";
import { createPage } from "./page.ts";

it("page render", () => {
	const render = () => "home";
	expect(createPage("_root_").render(render)).toEqual({ id: "_root_", render, document: false });
});
