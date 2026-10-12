import { expect, it } from "vitest";
import { createRootLayout } from "./root-layout.ts";

const render = (): string => "<html>";
const loader = (): { data: string } => ({ data: "root data" });

it("root render is the document", () => {
	expect(createRootLayout("_root_").render(render).document).toBe(true);
});

it("root chain", () => {
	expect(createRootLayout("_root_").loader(loader).render(render)).toEqual({
		id: "_root_",
		document: true,
		loader,
		render,
	});
});

function searchParams(raw: unknown): unknown {
	return raw;
}

it("root input", () => {
	expect(createRootLayout("_root_").input({ searchParams }).render(render).input).toEqual({ searchParams });
});
