import { createLayout } from "./layout.ts";
import type { LoaderDataOf, ParamsOutput, RawSearch, SearchOutput } from "./register.ts";
import { createRootLayout } from "./root-layout.ts";
import { expect, expectTypeOf, it } from "vitest";
import { createPage } from "./page.ts";

const loader = (): { data: string } => ({ data: "data" });
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

it("page intercept", () => {
	const page = createPage("_root_/photos/[id]")
		.intercept({ from: ["_root_/gallery"], render: "preview" })
		.cache({ client: { prefetch: "intent" } })
		.render(render);
	expect(page.intercept).toEqual({ from: ["_root_/gallery"], render: "preview" });
	expect(() => createPage("_root_/x").intercept({ from: [], render: "preview" })).toThrow(/from/);
	expect(() =>
		createPage("_root_/x")
			.cache({ ssr: { ttl: "1m" } })
			.intercept({ from: ["_root_/"], render: "preview" }),
	).toThrow(/order: intercept/);
	const twice = createPage("_root_/x").intercept({ from: ["_root_/"], render: "a" });
	expect(() => twice.intercept({ from: ["_root_/"], render: "b" })).toThrow(/intercept twice/);
});

// `.input()` and `.loader()` record their types on the route record (dx/types.md).
it("typed record", () => {
	const schema = {
		"~standard": {
			validate: (value: unknown) => ({ value }),
			types: { input: {}, output: { page: 1 } },
		},
	} as const;
	const route = createPage("_root_/users/[id]")
		.input({ params: (raw: unknown) => ({ id: Number(raw) }), searchParams: schema })
		.loader(async () => ({ n: 1 }))
		.render(() => null);
	expectTypeOf<ParamsOutput<typeof route>>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<SearchOutput<typeof route>>().toEqualTypeOf<{ readonly page: 1 }>();
	expectTypeOf<LoaderDataOf<typeof route>>().toEqualTypeOf<{ n: number }>();
	const parsed = createLayout("_root_/x")
		.input({ searchParams: { parse: async (raw: unknown) => ({ q: String(raw) }) } })
		.render(() => null);
	expectTypeOf<SearchOutput<typeof parsed>>().toEqualTypeOf<{ q: string }>();
	const bare = createRootLayout("_root_").render(() => null);
	expectTypeOf<SearchOutput<typeof bare>>().toEqualTypeOf<RawSearch>();
	expectTypeOf<ParamsOutput<typeof bare>>().toBeNever();
	expectTypeOf<LoaderDataOf<typeof bare>>().toBeVoid();
});
