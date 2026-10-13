import { flush } from "solid-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter } from "../../shared/router/create-router.ts";
import { mountNavigator, unmountAll, type Fetch } from "./navigate.fixture.ts";

// A navigation whose pages and layouts are all fresh in the client cache sends no request (dx/cache.md, B19). A
// layout's match id is the whole URL's, so across pages it is fresh only on its own `staleTime`.
const fresh = { client: { staleTime: "30s" } } as const;
const root = createRootLayout("_root_")
	.cache(fresh)
	.render((props) => ["root[", props.children, "]"]);
const home = createPage("_root_/")
	.cache(fresh)
	.render((props) => [() => `home:${String(props.loaderData)}`]);
const other = createPage("_root_/a")
	.cache(fresh)
	.render((props) => [() => `a:${String(props.loaderData)}:${String(Reflect.get(Object(props.search), "v"))}`]);
const router = createRouter({
	layouts: { _root_: root },
	routeTree: [
		{ id: "_root_/", path: "/", module: home },
		{ id: "_root_/a", path: "/a", module: other },
	],
});

function frames(page: string, data: string): Response {
	const list: Frame[] = [
		{ t: "l", m: "_root_", d: `root-${data}` },
		{ t: "l", m: page, d: data, v: { params: {}, search: { v: data } } },
		{ t: "h", m: page, d: { title: data } },
		{ t: "r" },
		{ t: "d" },
	];
	return new Response(list.map(encodeFrame).join(""), { headers: { "content-type": "application/x-ndjson" } });
}

beforeEach(() => {
	history.replaceState(null, "", "/");
	sessionStorage.clear();
});

afterEach(unmountAll);

it("fresh no request", async () => {
	let served = 0;
	const fetch = vi.fn<Fetch>(async (url) => {
		served += 1;
		return url.startsWith("/a") ? frames("_root_/a", `A${served}`) : frames("_root_/", `H${served}`);
	});
	const app = await mountNavigator(router, fetch);
	await app.navigator.navigate({ to: "_root_/a" });
	await app.navigator.navigate({ to: "_root_/" });
	await app.navigator.navigate({ to: "_root_/a" });
	flush();
	expect(fetch).toHaveBeenCalledTimes(2);
	expect(location.pathname).toBe("/a");
	expect(app.text()).toBe("root[a:A1:A1]");
	expect(app.store.snapshot().heads.at(-1)).toEqual({ title: "A1" });
	// `/` and `/a` share the empty match id (no params, no search), so the root is the mounted match and keeps its data.
	expect(app.store.snapshot().matches[0]?.data).toBe("root-H2");
	await app.navigator.navigate({ to: "_root_/a", revalidate: true });
	flush();
	expect(fetch).toHaveBeenCalledTimes(3);
	expect(app.text()).toBe("root[a:A3:A3]");
});
