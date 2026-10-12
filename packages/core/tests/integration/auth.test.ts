import { expect, it } from "vitest";
import { createServer } from "../../src/server/lifecycle/create.ts";
import { createLayout } from "../../src/shared/route-builder/layout.ts";
import { createPage } from "../../src/shared/route-builder/page.ts";
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts";
import { createRouter, type RouterOptions } from "../../src/shared/router/create-router.ts";

type Spy = { seen: string[]; mark: (name: string) => () => string };

function spy(): Spy {
	const seen: string[] = [];
	return {
		seen,
		mark: (name) => () => {
			seen.push(name);
			return name;
		},
	};
}

function noop(): void {}

function show(props: { loaderData: unknown }): string {
	return `[${String(props.loaderData)}]`;
}

function serve(options: RouterOptions, authenticate: () => unknown = () => null): ReturnType<typeof createServer> {
	return createServer({ router: createRouter(options), authenticate });
}

async function get(
	server: ReturnType<typeof createServer>,
	path: string,
	headers: HeadersInit = {},
): Promise<{ status: number; body: string }> {
	const response = await server.fetch(new Request(`http://localhost${path}`, { headers }));
	return { status: response.status, body: await response.text() };
}

it("layout gate", async () => {
	const calls = spy();
	const server = serve({
		layouts: {
			_root_: createRootLayout("_root_").render(show),
			"_root_/admin": createLayout("_root_/admin").authenticate().render(show),
		},
		routeTree: [
			{
				id: "_root_/admin/panel",
				path: "/admin/panel",
				module: createPage("_root_/admin/panel").loader(calls.mark("PAGE-SECRET")).render(show),
			},
		],
	});
	const result = await get(server, "/admin/panel");
	expect(result.status).toBe(401);
	expect(result.body).not.toContain("PAGE-SECRET");
	expect(calls.seen).toEqual([]);
});

it("outer public", async () => {
	const calls = spy();
	const server = serve({
		layouts: {
			_root_: createRootLayout("_root_").loader(calls.mark("root loader")).render(show),
			"_root_/app": createLayout("_root_/app").loader(calls.mark("public loader")).render(show),
			"_root_/app/admin": createLayout("_root_/app/admin")
				.authenticate()
				.authorize(() => {
					calls.seen.push("admin authorize");
					return true;
				})
				.preloader(calls.mark("admin preloader"))
				.loader(calls.mark("admin loader"))
				.render(show),
		},
		routeTree: [
			{
				id: "_root_/app/admin/users",
				path: "/app/admin/users",
				module: createPage("_root_/app/admin/users").loader(calls.mark("page loader")).render(show),
			},
		],
	});
	const result = await get(server, "/app/admin/users");
	expect(result.status).toBe(401);
	expect(calls.seen.toSorted()).toEqual(["public loader", "root loader"]);
});

function blogRouter(calls: Spy): RouterOptions {
	return {
		layouts: {
			_root_: createRootLayout("_root_").loader(calls.mark("root")).render(show),
			"_root_/blog": createLayout("_root_/blog").loader(calls.mark("blog")).render(show),
			"_root_/shop": createLayout("_root_/shop").loader(calls.mark("shop")).render(show),
		},
		routeTree: [
			{
				id: "_root_/blog/post",
				path: "/blog/post",
				module: createPage("_root_/blog/post").loader(calls.mark("post")).render(show),
			},
		],
	};
}

it("fuzzy loaders", async () => {
	const calls = spy();
	const result = await get(serve({ ...blogRouter(calls), notFoundMode: "fuzzy" }), "/blog/missing");
	expect(result.status).toBe(404);
	expect(calls.seen.toSorted()).toEqual(["blog", "root"]);
});

it("root loaders", async () => {
	const calls = spy();
	const result = await get(serve(blogRouter(calls)), "/blog/missing");
	expect(result.status).toBe(404);
	expect(calls.seen).toEqual(["root"]);
});

it("interleaved", async () => {
	let release: () => void = noop;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const server = serve({
		layouts: { _root_: createRootLayout("_root_").render(show) },
		routeTree: [
			{
				id: "_root_",
				path: "/",
				module: createPage("_root_")
					.loader(async (ctx) => {
						const sentinel = ctx.request.headers.get("x-sentinel");
						if (sentinel === "alpha") await held;
						return sentinel;
					})
					.render(show),
			},
		],
	});
	const alpha = get(server, "/", { "x-sentinel": "alpha" });
	const beta = await get(server, "/", { "x-sentinel": "beta" });
	release();
	const first = await alpha;
	expect(first.body).toContain("[alpha]");
	expect(first.body).not.toContain("beta");
	expect(beta.body).toContain("[beta]");
	expect(beta.body).not.toContain("alpha");
});

it("header identity", async () => {
	const sessions: unknown[] = [];
	const server = createServer({
		router: createRouter({
			layouts: { _root_: createRootLayout("_root_").render(show) },
			routeTree: [
				{
					id: "_root_",
					path: "/",
					module: createPage("_root_")
						.authenticateOptional()
						.loader((ctx) => {
							sessions.push(ctx.auth);
							return ctx.request.headers.get("authorization");
						})
						.render(show),
				},
			],
		}),
		authenticate: () => null,
	});
	const [ada, bob] = await Promise.all([
		get(server, "/", { authorization: "Bearer ada-token" }),
		get(server, "/", { authorization: "Bearer bob-token" }),
	]);
	expect(sessions).toEqual([null, null]);
	expect(ada.body).toContain("ada-token");
	expect(ada.body).not.toContain("bob-token");
	expect(bob.body).toContain("bob-token");
	expect(bob.body).not.toContain("ada-token");
});
