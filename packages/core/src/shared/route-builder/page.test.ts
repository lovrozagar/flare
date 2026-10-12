import { expect, it } from "vitest";
import { createPage } from "./page.ts";

const loader = (): string => "data";
const handle = (): Response => new Response("ok");

const render = (): string => "home";

it("page render", () => {
	expect(createPage("_root_/").render(render)).toEqual({ id: "_root_/", render, document: false });
});

it("page chain", () => {
	const page = createPage("_root_/about")
		.cache({ ssr: { ttl: "1m" } })
		.authenticate()
		.loader(loader)
		.render(render);
	expect(page).toEqual({
		id: "_root_/about",
		document: false,
		cache: { ssr: { ttl: "1m" } },
		auth: { mode: true, callerData: [] },
		loader,
		render,
	});
	expect(createPage("_root_/api").authenticate().response(handle)).toEqual({
		id: "_root_/api",
		document: false,
		auth: { mode: true, callerData: [] },
		response: handle,
	});
});
