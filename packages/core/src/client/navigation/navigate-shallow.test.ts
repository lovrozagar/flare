import { flush } from "solid-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSearch } from "../../shared/components/index.ts";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter } from "../../shared/router/create-router.ts";
import { mountNavigator, unmountAll, type Fetch } from "./navigate.fixture.ts";

// A shallow navigation changes the URL and the page's search, and asks the server for nothing (BUGS.md B18).
const root = createRootLayout("_root_").render((props) => ["root[", props.children, "]"]);
const home = createPage("_root_/").render((props) => {
	const search = useSearch({ from: "_root_/" });
	return [() => `home:${String(props.loaderData)}:${String(Reflect.get(Object(search), "q"))}`];
});
const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/", path: "/", module: home }] });

beforeEach(() => {
	history.replaceState(null, "", "/");
	sessionStorage.clear();
});

afterEach(unmountAll);

it("shallow", async () => {
	const fetch = vi.fn<Fetch>(async () => new Response(""));
	const app = await mountNavigator(router, fetch);
	const track = vi.spyOn(app.deps.navigation, "track");
	const stored = vi.spyOn(app.deps.cache, "store");
	const length = history.length;
	await app.navigator.navigate({ to: "_root_/", search: { q: "a" }, shallow: true });
	flush();
	expect(location.search).toBe("?q=a");
	expect(history.length).toBe(length + 1);
	expect(app.text()).toBe("root[home:start:a]");
	expect(app.store.snapshot().matches.at(-1)?.search).toEqual({ q: "a" });
	await app.navigator.navigate({ to: "_root_/", search: { q: "b" }, shallow: true, replace: true });
	flush();
	expect(location.search).toBe("?q=b");
	expect(history.length).toBe(length + 1);
	expect(app.text()).toBe("root[home:start:b]");
	expect(fetch).not.toHaveBeenCalled();
	expect(track).not.toHaveBeenCalled();
	expect(stored).not.toHaveBeenCalled();
	expect(app.deps.navigation.pending()).toBe(false);
});

it("shallow blocked", async () => {
	const fetch = vi.fn<Fetch>(async () => new Response(""));
	const app = await mountNavigator(router, fetch);
	const blocker = vi.fn<() => boolean>(() => false);
	app.deps.blockers.register(blocker);
	const length = history.length;
	await app.navigator.navigate({ to: "_root_/", search: { q: "a" }, shallow: true });
	flush();
	expect(blocker).toHaveBeenCalledOnce();
	expect(location.search).toBe("");
	expect(history.length).toBe(length);
	expect(app.text()).toBe("root[home:start:undefined]");
	expect(app.store.snapshot().matches.at(-1)?.search).toEqual({});
	expect(fetch).not.toHaveBeenCalled();
});
