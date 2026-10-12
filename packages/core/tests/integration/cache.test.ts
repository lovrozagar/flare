import { createComponent, type Element } from "solid-js";
import { Dynamic } from "@solidjs/web";
import { expect, it, vi, type Mock } from "vitest";
import type { FlareStore } from "../../src/server/cache/contract.ts";
import { createMemoryStore } from "../../src/server/cache/memory.ts";
import { createServer } from "../../src/server/lifecycle/create.ts";
import { createLayout } from "../../src/shared/route-builder/layout.ts";
import { createPage } from "../../src/shared/route-builder/page.ts";
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts";
import { createRouter, type RouteModule } from "../../src/shared/router/create-router.ts";

const SITE = "https://example.com";

function documentOf(children: Element): Element {
	return createComponent(Dynamic, {
		component: "html",
		get children() {
			return [
				createComponent(Dynamic, { component: "head" }),
				createComponent(Dynamic, { component: "body", children }),
			];
		},
	});
}

const root = createRootLayout("_root_").render((props) => documentOf(props.children));

// One page at /p over a memory store whose writes are watched. A layout, when given, sits between root and page.
function serve(
	page: RouteModule,
	extra: { layout?: RouteModule; authenticate?: (ctx: { request: Request }) => unknown } = {},
): {
	app: ReturnType<typeof createServer>;
	store: FlareStore;
	set: Mock<FlareStore["set"]>;
} {
	const memory = createMemoryStore();
	const set = vi.fn<FlareStore["set"]>(memory.set);
	const store = { ...memory, set };
	const layouts: Record<string, RouteModule> = { _root_: root };
	if (extra.layout !== undefined) layouts["_root_/(g)"] = extra.layout;
	const id = extra.layout === undefined ? "_root_/p" : "_root_/(g)/p";
	const router = createRouter({ layouts, routeTree: [{ id, path: "/p", module: page }] });
	return { app: createServer({ router, site: SITE, store, authenticate: extra.authenticate }), store, set };
}

// A cookie the route sets without `allowCookies` makes the answer private, and nothing is stored (dx/cache.md).
it("set-cookie", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn: { maxAge: "60s" } })
		.headers(() => ({ "set-cookie": "r=1" }))
		.render(() => "p");
	const { app, set } = serve(page);
	const response = await app.fetch(new Request(`${SITE}/p`));
	expect(response.headers.get("cache-control")).toBe("private, no-store");
	expect(response.headers.getSetCookie()).toEqual(["r=1"]);
	await new Promise((resolve) => setTimeout(resolve, 10));
	expect(set).not.toHaveBeenCalled();
});

const KEY = "static:dev:_root_/p";

// A stored record built by hand, as a write leaves it, fresh at `Date.now()`.
function storedRecord(text: string): { data: unknown; storedAt: number; tags: string[] } {
	const sentinel = "__FLARE_NONCE_00000000000000000000000000000000";
	const html = `<html><head></head><body>${text}<script nonce="${sentinel}">self.flare={"matches":[],"nonce":"${sentinel}"}</script></body></html>`;
	const data = { html, ndjson: '{"t":"r"}\n{"t":"d"}\n', headers: [], security: {}, sentinel, render: "isr" };
	return { data, storedAt: Date.now(), tags: [] };
}

// A required chain is never shared, so a 401 is never stored: the next request authenticates again (B27).
it("401 not stored", async () => {
	const authenticate = vi.fn<() => unknown>(() => null);
	const layout = createLayout("_root_/(g)")
		.authenticate()
		.render((props) => props.children);
	const page = createPage("_root_/(g)/p")
		.cache({ isr: true })
		.render(() => "p");
	const { app, set } = serve(page, { layout, authenticate });
	expect((await app.fetch(new Request(`${SITE}/p`))).status).toBe(401);
	expect((await app.fetch(new Request(`${SITE}/p`))).status).toBe(401);
	expect(authenticate).toHaveBeenCalledTimes(2);
	expect(set).not.toHaveBeenCalled();
});

// `authorize` runs, after preloader, before the read. `false` is 403 and the stored body is not used (B73).
it("authorize before hit", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.authorize(() => false)
		.render(() => "p");
	const { app, store } = serve(page);
	await store.set(KEY, storedRecord("SECRET"));
	const response = await app.fetch(new Request(`${SITE}/p`));
	expect(response.status).toBe(403);
	expect(await response.text()).not.toContain("SECRET");
	const data = await app.fetch(new Request(`${SITE}/p?_flare=data`));
	expect(data.status).toBe(403);
	expect(await data.text()).not.toContain("SECRET");
	// An authorize that passes reaches the read, and the stored body is served.
	const allowed = createPage("_root_/p")
		.cache({ isr: true })
		.authorize(() => true)
		.render(() => "p");
	const open = serve(allowed);
	await open.store.set(KEY, storedRecord("SHARED"));
	const hit = await open.app.fetch(new Request(`${SITE}/p`));
	expect(hit.headers.get("flare-cache")).toBe("hit");
	expect(await hit.text()).toContain("SHARED");
});

it("hit without authorize", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.render(() => "p");
	const { app, store } = serve(page);
	await store.set(KEY, storedRecord("STORED"));
	const response = await app.fetch(new Request(`${SITE}/p`));
	expect(response.headers.get("flare-cache")).toBe("hit");
	expect(await response.text()).toContain("STORED");
});

// An optional-auth page stores its anonymous render. The next anonymous request is a hit with no session text.
it("anonymous stored", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.authenticateOptional()
		.loader(({ auth }) => ({ who: auth === null ? "anonymous" : "SESSION" }))
		.render((props) => props.loaderData.who);
	const { app, set } = serve(page, { authenticate: () => null });
	await app.fetch(new Request(`${SITE}/p`));
	await vi.waitFor(() => expect(set).toHaveBeenCalled());
	const second = await app.fetch(new Request(`${SITE}/p`));
	expect(second.headers.get("flare-cache")).toBe("hit");
	const body = await second.text();
	expect(body).toContain("anonymous");
	expect(body).not.toContain("SESSION");
});

const bearer = ({ request }: { request: Request }): unknown => request.headers.get("authorization");

// A request with a session is private and renders live. Neither user ever receives the other's body.
it("two users", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.authenticateOptional()
		.loader(({ auth }) => ({ who: auth === null ? "anonymous" : String(auth) }))
		.render((props) => `USER[${props.loaderData.who}]`);
	const { app } = serve(page, { authenticate: bearer });
	const as = (token: string) => app.fetch(new Request(`${SITE}/p`, { headers: { authorization: token } }));
	for (let round = 0; round < 2; round += 1) {
		const alice = await (await as("alice-token")).text();
		const bob = await (await as("bob-token")).text();
		expect(alice).toContain("USER[alice-token]");
		expect(alice).not.toContain("bob-token");
		expect(bob).toContain("USER[bob-token]");
		expect(bob).not.toContain("alice-token");
	}
});

const listed = () => [{ slug: "a" }];

function post(store = createMemoryStore()): {
	app: ReturnType<typeof createServer>;
	set: Mock<FlareStore["set"]>;
	store: FlareStore;
} {
	const set = vi.fn<FlareStore["set"]>(store.set);
	const page = createPage("_root_/post/[slug]")
		.cache({ isr: { params: listed, dynamicParams: false } })
		.render(() => "post");
	const router = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/post/[slug]", path: "/post/[slug]", module: page }],
	});
	return { app: createServer({ router, site: SITE, store: { ...store, set } }), set, store };
}

// `dynamicParams: false` 404s a slug `params()` did not return, on the document and the data URL, and never
// stores it: a second request is still the router's 404, not a stored 200.
it("not found", async () => {
	const { app, set } = post();
	for (let round = 0; round < 2; round += 1) {
		expect((await app.fetch(new Request(`${SITE}/post/b`))).status).toBe(404);
		expect((await app.fetch(new Request(`${SITE}/post/b?_flare=data`))).status).toBe(404);
	}
	expect(set).not.toHaveBeenCalled();
	expect((await app.fetch(new Request(`${SITE}/post/a`))).status).toBe(200);
});

// A listed slug whose tombstone is newer renders live, and the body may be stored again.
it("purged listed", async () => {
	const memory = createMemoryStore();
	await memory.delete("static:dev:_root_/post/[slug]:a");
	const { app, set } = post(memory);
	const response = await app.fetch(new Request(`${SITE}/post/a`));
	expect(response.headers.get("flare-cache")).toBe("miss");
	expect(await response.text()).toContain("post");
	await vi.waitFor(() => expect(set).toHaveBeenCalledOnce());
});
