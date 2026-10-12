import type { JSX } from "@solidjs/web";
import { expect, it } from "vitest";
import { createServer } from "../../src/server/lifecycle/create.ts";
import { createLayout } from "../../src/shared/route-builder/layout.ts";
import { createPage } from "../../src/shared/route-builder/page.ts";
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts";
import { createRouter, type RouterOptions } from "../../src/shared/router/create-router.ts";

type Spy = { seen: string[]; mark: (name: string) => () => { text: string } };

function spy(): Spy {
	const seen: string[] = [];
	return {
		seen,
		mark: (name) => () => {
			seen.push(name);
			return { text: name };
		},
	};
}

function noop(): void {}

// A layout shows its data, then its outlet. A page has no children.
function show(props: { loaderData: unknown; children?: JSX.Element }): JSX.Element {
	return [`[${label(props.loaderData)}]`, props.children];
}

// Loader data is an object or nothing (dx/builder.md). These loaders return { text }.
function label(data: unknown): string {
	return typeof data === "object" && data !== null && "text" in data ? String(data.text) : String(data);
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
				module: createPage("_root_/")
					.loader(async (ctx) => {
						const sentinel = ctx.request.headers.get("x-sentinel");
						if (sentinel === "alpha") await held;
						return { text: sentinel };
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
					module: createPage("_root_/")
						.authenticateOptional()
						.loader((ctx) => {
							sessions.push(ctx.auth);
							return { text: ctx.request.headers.get("authorization") };
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

type Responded = { calls: string[]; contexts: unknown[]; loaded: boolean };

function responseServer(
	session: unknown,
	allowed: boolean,
): { server: ReturnType<typeof createServer>; seen: Responded } {
	const seen: Responded = { calls: [], contexts: [], loaded: false };
	const api = createPage("_root_/api")
		.authenticate()
		.authorize(() => {
			seen.calls.push("authorize");
			return allowed;
		})
		.preloader(() => ({ scope: "api" }))
		.response((ctx) => {
			seen.calls.push("fn");
			seen.contexts.push(ctx);
			return new Response("answered", {
				status: 202,
				headers: { "x-frame-options": "ALLOWALL", "x-api": "1" },
			});
		});
	const server = createServer({
		router: createRouter({
			layouts: {
				_root_: createRootLayout("_root_")
					.loader(() => {
						seen.loaded = true;
						return { text: "root" };
					})
					.render(show),
			},
			routeTree: [{ id: "_root_/api", path: "/api", module: api }],
		}),
		authenticate: () => session,
	});
	return { server, seen };
}

it("response denied", async () => {
	const { server, seen } = responseServer({ id: "ada" }, false);
	const response = await server.fetch(new Request("https://localhost/api"));
	expect(response.status).toBe(403);
	expect(response.headers.get("content-security-policy")).toMatch(/script-src/);
	expect(seen.calls).toEqual(["authorize"]);
	expect(seen.loaded).toBe(false);
});

it("response no session", async () => {
	const { server, seen } = responseServer(null, true);
	const response = await server.fetch(new Request("https://localhost/api"));
	expect(response.status).toBe(401);
	expect(seen.calls).toEqual([]);
});

it("response passes", async () => {
	const { server, seen } = responseServer({ id: "ada" }, true);
	const request = new Request("https://localhost/api", { method: "POST", body: "x" });
	const response = await server.fetch(request, { region: "eu" });
	expect(response.status).toBe(202);
	expect(await response.text()).toBe("answered");
	expect(response.headers.get("x-api")).toBe("1");
	expect(response.headers.get("x-frame-options")).toBe("DENY");
	expect(response.headers.get("content-security-policy")).toMatch(/script-src/);
	expect(seen.calls).toEqual(["authorize", "fn"]);
	expect(seen.contexts).toEqual([
		{ auth: { id: "ada" }, request, env: { region: "eu" }, params: {}, search: {}, preloaderContext: { scope: "api" } },
	]);
	expect(seen.loaded).toBe(false);
});

function answering(respond: () => Response): ReturnType<typeof createServer> {
	return createServer({
		router: createRouter({
			layouts: { _root_: createRootLayout("_root_").render(show) },
			routeTree: [{ id: "_root_/file", path: "/file", module: createPage("_root_/file").response(respond) }],
		}),
	});
}

it("response binary", async () => {
	const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0x80]);
	const server = answering(() => new Response(bytes, { headers: { "content-type": "image/png" } }));
	const response = await server.fetch(new Request("http://localhost/file"));
	expect(response.headers.get("content-type")).toBe("image/png");
	expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...bytes]);
});

it("response stream", async () => {
	const encoder = new TextEncoder();
	const endless = new ReadableStream<Uint8Array>({
		pull(controller) {
			controller.enqueue(encoder.encode("data: tick\n\n"));
		},
	});
	const server = answering(() => new Response(endless, { headers: { "content-type": "text/event-stream" } }));
	const response = await server.fetch(new Request("http://localhost/file"));
	const body = response.body;
	if (body === null) throw new Error("stream body");
	const reader = body.getReader();
	const first = await reader.read();
	expect(new TextDecoder().decode(first.value)).toBe("data: tick\n\n");
	await reader.cancel();
});
