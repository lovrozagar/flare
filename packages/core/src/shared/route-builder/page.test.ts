import { createLayout } from "./layout.ts";
import type { LoaderDataOf, ParamsOutput, RawSearch, SearchOutput } from "./register.ts";
import type { InitialState, ParentAuth, ParentContext, RouteBuilder, TypedRecord, With } from "./route-types.ts";
import { createRootLayout } from "./root-layout.ts";
import { expect, expectTypeOf, it } from "vitest";
import { createPage } from "./page.ts";

const loader = (): { data: string } => ({ data: "data" });
const handle = (): Response => new Response("ok");

const render = (): string => "home";

it("page render", () => {
	expect(createPage("_root_/").render(render)).toEqual({ _type: "page", id: "_root_/", render, document: false });
});

it("page chain", () => {
	const page = createPage("_root_/about")
		.cache({ ssr: { ttl: "1m" } })
		.authenticate()
		.loader(loader)
		.render(render);
	expect(page).toEqual({
		_type: "page",
		id: "_root_/about",
		document: false,
		cache: { ssr: { ttl: "1m" } },
		auth: { mode: true, callerData: [] },
		loader,
		render,
	});
	expect(createPage("_root_/api").authenticate().response(handle)).toEqual({
		_type: "page",
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

// The register a generated file would write for a layout under the root (dx/types.md).
type Root = TypedRecord<With<InitialState<"_root_", true>, "preloader", { a: 1 }>, "root">;
type Group = TypedRecord<With<InitialState<"_root_/(g)", false>, "preloader", { b: 2 }>, "layout">;
type App = {
	routeParents: { "_root_/(g)/x": ["_root_", "_root_/(g)"] };
	authModes: { "_root_/(g)": true };
	routeModules: { _root_: Root; "_root_/(g)": Group };
};

it("typed contexts", () => {
	createRootLayout("_root_")
		.preloader((ctx) => {
			// @ts-expect-error the root's preloader has no parents
			void ctx.preloaderContext;
			return { requestId: "r" };
		})
		.loader((ctx) => {
			expectTypeOf(ctx.preloaderContext).toEqualTypeOf<{ requestId: string }>();
			expectTypeOf(ctx.auth).toEqualTypeOf<null>();
			return { n: 1 };
		})
		.render((props) => {
			expectTypeOf(props.loaderData).toEqualTypeOf<{ n: number }>();
			expectTypeOf(props).toHaveProperty("children");
			return null;
		});
	createPage("_root_/users/[id]").render((props) => {
		expectTypeOf(props.params).toEqualTypeOf<{ id: string }>();
		expectTypeOf(props.loaderData).toBeVoid();
		// @ts-expect-error a page renders no children
		void props.children;
		return null;
	});
	// A route whose parents require auth cannot loosen to optional.
	type Required = RouteBuilder<With<InitialState<"_root_/a", false>, "auth", true>, "page">;
	expectTypeOf<Parameters<Required["authenticateOptional"]>>().toEqualTypeOf<[never]>();
	expectTypeOf<ParentAuth<App, "_root_/(g)/x">>().toEqualTypeOf<true>();
	expectTypeOf<ParentContext<App, "_root_/(g)/x">["a"]>().toEqualTypeOf<1>();
	expectTypeOf<ParentContext<App, "_root_/(g)/x">["b"]>().toEqualTypeOf<2>();
	expectTypeOf<ParentContext<{ routeParents: { x: ["gone"] }; routeModules: {} }, "x">>().toBeNever();
});
