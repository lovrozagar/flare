import { flush } from "solid-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter } from "../../shared/router/create-router.ts";
import { createMatchCache } from "../router/match-cache.ts";
import { useLoaderData, useSearch } from "../../shared/components/index.ts";
import { mountNavigator, unmountAll, type Fetch } from "./navigate.fixture.ts";
import type { Landing, NavigatorDeps } from "./navigate.ts";

const root = createRootLayout("_root_").render((props) => ["root[", props.children, "]"]);
// A refresh keeps the component mounted, so the text reads loaderData reactively.
const home = createPage("_root_/").render((props) => [() => `home:${String(props.loaderData)}`]);
const about = createPage("_root_/about").render((props) => `about:${String(props.loaderData)}`);
const refetching = createPage("_root_/refetch")
	.effects({ shouldRefetch: () => true })
	.render((props) => `refetch:${String(props.loaderData)}`);
const mounts = { live: 0 };
const live = createPage("_root_/live").render(() => {
	mounts.live += 1;
	const data = useLoaderData({ from: "_root_/live" });
	return [() => `live:${String(Reflect.get(Object(data), "title"))}`];
});
// The client never runs this validator (B8). What it paints comes from the `l` frame's `v`.
const searched = createPage("_root_/search")
	.input({ searchParams: (raw) => raw })
	.render(() => {
		const search = useSearch({ from: "_root_/search" });
		return [() => `search:${typeof Reflect.get(Object(search), "page")}`];
	});
const tabs = createPage("_root_/tabs/[[tab]]").render((props) => `tabs:${String(props.loaderData)}`);
const router = createRouter({
	layouts: { _root_: root, _admin_: root },
	routeTree: [
		{ id: "_root_/", path: "/", module: home },
		{ id: "_root_/about", path: "/about", module: about },
		{ id: "_root_/tabs/[[tab]]", path: "/tabs/[[tab]]", module: tabs },
		{
			id: "_root_/lazy",
			path: "/lazy",
			module: () => Promise.reject(new TypeError("Failed to fetch dynamically imported module")),
		},
		{ id: "_root_/broken", path: "/broken", module: () => Promise.reject(new SyntaxError("Unexpected token")) },
		{ id: "_root_/refetch", path: "/refetch", module: () => Promise.resolve(refetching) },
		{ id: "_root_/live", path: "/live", module: live },
		{ id: "_root_/search", path: "/search", module: searched },
		{ id: "_admin_/panel", path: "/panel", module: about },
	],
});

beforeEach(() => {
	history.replaceState(null, "", "/");
	sessionStorage.clear();
});

afterEach(unmountAll);

const aboutFrames: Frame[] = [
	{ t: "l", m: "_root_", d: null },
	{ t: "l", m: "_root_/about", d: "fresh" },
	{ t: "r" },
	{ t: "d" },
];

function ndjson(frames: readonly Frame[], headers: Record<string, string> = {}): Response {
	return new Response(frames.map(encodeFrame).join(""), {
		headers: { "content-type": "application/x-ndjson", ...headers },
	});
}

function setup(fetch: Fetch, extra: Partial<NavigatorDeps> = {}) {
	return mountNavigator(router, fetch, { extra });
}

it("commit then push", async () => {
	const app = await setup(async () => ndjson(aboutFrames));
	const seen: string[] = [];
	const push = vi.spyOn(history, "pushState").mockImplementation(function (this: History, ...args) {
		seen.push(app.text());
		History.prototype.pushState.apply(this, args);
	});
	await app.navigator.navigate({ to: "_root_/about" });
	flush();
	expect(app.text()).toBe("root[about:fresh]");
	expect(seen).toEqual(["root[about:fresh]"]);
	expect(location.pathname).toBe("/about");
	expect(app.deps.fetch).toHaveBeenCalledWith(
		"/about?_flare=data",
		expect.objectContaining({ signal: expect.any(AbortSignal) }),
	);
	push.mockRestore();
});

it("network", async () => {
	const app = await setup(() => Promise.reject(new TypeError("Failed to fetch")));
	const length = history.length;
	await app.navigator.navigate({ to: "_root_/about" });
	flush();
	expect(app.text()).toBe("root[home:start]");
	expect(history.length).toBe(length);
	expect(location.pathname).toBe("/");
});

it("auth error", async () => {
	for (const [status, text] of [
		[401, "Please log in"],
		[403, "Access denied"],
	] as const) {
		history.replaceState(null, "", "/");
		const app = await setup(async () => new Response(null, { status }));
		await app.navigator.navigate({ to: "_root_/about" });
		flush();
		expect(app.host.innerHTML).toContain(`<div>${text}</div>`);
		expect(app.text()).toBe(`root[${text}]`);
		expect(location.pathname).toBe("/about");
	}
});

it("request failed", async () => {
	const app = await setup(async () => new Response(null, { status: 500 }));
	await app.navigator.navigate({ to: "_root_/about" });
	flush();
	expect(app.store.snapshot().failure?.error.message).toBe("Request failed");
	expect(app.text()).toBe("root[Something went wrong]");
	expect(location.pathname).toBe("/about");
});

it("loader error", async () => {
	const app = await setup(async () =>
		ndjson([
			{ t: "l", m: "_root_", d: null },
			{ t: "e", m: "_root_/about", e: { message: "x", digest: "0" } },
			{ t: "r" },
			{ t: "d" },
		]),
	);
	await app.navigator.navigate({ to: "_root_/about" });
	flush();
	expect(app.text()).toBe("root[Something went wrong]");
	expect(
		app.deps.cache.read({ route: "_root_/about", id: "&", layout: false, params: {}, search: {} }),
	).toBeUndefined();
	expect(location.pathname).toBe("/about");
});

it("same origin", async () => {
	const responses = [ndjson([{ t: "x", s: 302, u: "/about", r: true }]), ndjson(aboutFrames)];
	const app = await setup(async () => responses.shift() ?? ndjson(aboutFrames));
	await app.navigator.navigate({ to: "_root_/", search: { go: "1" } });
	flush();
	expect(app.text()).toBe("root[about:fresh]");
	expect(app.deps.fetch).toHaveBeenLastCalledWith("/about?_flare=data", expect.anything());
});

it("href load", async () => {
	const app = await setup(async () => ndjson([{ t: "x", s: 302, u: "https://example.com/a", r: true }]));
	const length = history.length;
	await app.navigator.navigate({ to: "_root_/about" });
	expect(app.deps.assign).toHaveBeenCalledExactlyOnceWith("https://example.com/a");
	expect(history.length).toBe(length);
});

it("input 400", async () => {
	const app = await setup(async () => Response.json({ issues: [] }, { status: 400 }));
	await app.navigator.navigate({ to: "_root_/about" });
	flush();
	expect(app.text()).toBe("root[home:start]");
	expect(location.pathname).toBe("/");
});

it("revalidation", async () => {
	const app = await setup(async () =>
		ndjson([{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/", d: "again" }, { t: "r" }, { t: "d" }]),
	);
	const length = history.length;
	await app.navigator.navigate({ to: "_root_/" });
	flush();
	expect(app.text()).toBe("root[home:again]");
	expect(history.length).toBe(length);
});

it("replace", async () => {
	const app = await setup(async () => ndjson(aboutFrames));
	const replace = vi.spyOn(history, "replaceState");
	const length = history.length;
	await app.navigator.navigate({ to: "_root_/about", replace: true });
	expect(replace).toHaveBeenCalled();
	expect(history.length).toBe(length);
	expect(location.pathname).toBe("/about");
	replace.mockRestore();
});

it("abort", async () => {
	const first = Promise.withResolvers<Response>();
	const signals: AbortSignal[] = [];
	const calls = [() => first.promise, async () => ndjson(aboutFrames)];
	const app = await setup((_url, init) => {
		signals.push(init.signal as AbortSignal);
		return (calls.shift() ?? calls[0])();
	});
	const slow = app.navigator.navigate({ to: "_root_/", search: { slow: "1" } });
	await app.navigator.navigate({ to: "_root_/about" });
	expect(signals[0].aborted).toBe(true);
	first.resolve(ndjson([{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/", d: "late" }, { t: "r" }]));
	await slow;
	flush();
	expect(app.text()).toBe("root[about:fresh]");
	expect(location.pathname).toBe("/about");
});

it("reuse prefetch", async () => {
	const landing: Landing = { data: { _root_: null, "_root_/about": "prefetched" }, heads: {} };
	const prefetched = vi.fn<NonNullable<NavigatorDeps["prefetched"]>>(() => Promise.resolve(landing));
	const app = await setup(async () => ndjson(aboutFrames), { prefetched });
	await app.navigator.navigate({ to: "_root_/about" });
	flush();
	expect(app.text()).toBe("root[about:prefetched]");
	expect(app.deps.fetch).not.toHaveBeenCalled();
	await app.navigator.navigate({ to: "_root_/about", revalidate: true });
	flush();
	expect(app.deps.fetch).toHaveBeenCalledOnce();
	const holed: Landing = { data: { "_root_/about": { slow: { __deferred: true, key: "d0" } } }, heads: {} };
	prefetched.mockImplementation(() => Promise.resolve(holed));
	await app.navigator.navigate({ to: "_root_/" });
	await app.navigator.navigate({ to: "_root_/about" });
	expect(app.deps.fetch).toHaveBeenCalledTimes(3);
});

it("build mismatch", async () => {
	const app = await setup(async () => ndjson(aboutFrames, { "flare-build": "b2" }));
	await app.navigator.navigate({ to: "_root_/about" });
	flush();
	expect(app.deps.reload).toHaveBeenCalledExactlyOnceWith("/about");
	expect(app.text()).toBe("root[home:start]");
	const empty = await setup(async () => ndjson(aboutFrames, { "flare-build": "b2" }), { build: "" });
	await empty.navigator.navigate({ to: "_root_/about" });
	flush();
	expect(empty.text()).toBe("root[about:fresh]");
});

it("hash move", async () => {
	const app = await setup(async () => ndjson(aboutFrames));
	await app.navigator.navigate({ to: "_root_/", hash: "part", scroll: false });
	expect(app.deps.fetch).not.toHaveBeenCalled();
	expect(location.hash).toBe("#part");
	expect(app.store.snapshot().location.hash).toBe("#part");
});

it("visit", async () => {
	const app = await setup(async () => ndjson(aboutFrames));
	await app.navigator.visit("/about", true);
	flush();
	expect(app.text()).toBe("root[about:fresh]");
	expect(location.pathname).toBe("/about");
});

it("stale param", async () => {
	const titled: Frame[] = [
		...aboutFrames.slice(0, 2),
		{ t: "h", m: "_root_/about", d: { title: "About" } },
		{ t: "r" },
	];
	const responses = [ndjson(titled), ndjson(aboutFrames)];
	const app = await setup(async () => responses.shift() ?? ndjson([{ t: "l", m: "_root_", d: null }, { t: "r" }]), {
		cache: createMatchCache({ staleTime: 60_000, gcTime: 60_000 }),
	});
	await app.navigator.navigate({ to: "_root_/about" });
	await app.navigator.navigate({ to: "_root_/" });
	await app.navigator.navigate({ to: "_root_/about" });
	expect(app.deps.fetch).toHaveBeenLastCalledWith("/about?_flare=data&_flare_stale=%26", expect.anything());
	flush();
	expect(app.text()).toBe("root[about:fresh]");
	expect(app.store.snapshot().heads[1]).toEqual({ title: "About" });
});

it("effects read", async () => {
	const frames: Frame[] = [{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/refetch", d: "x" }, { t: "r" }];
	const app = await setup(async () => ndjson(frames), {
		cache: createMatchCache({ staleTime: 60_000, gcTime: 60_000 }),
	});
	await app.navigator.navigate({ to: "_root_/refetch" });
	await app.navigator.navigate({ to: "_root_/refetch", search: { again: "1" } });
	await app.navigator.navigate({ to: "_root_/refetch" });
	expect(app.deps.fetch).toHaveBeenLastCalledWith("/refetch?_flare=data", expect.anything());
});

it("search keyed", async () => {
	const app = await setup(async () => ndjson(aboutFrames), {
		cache: createMatchCache({ staleTime: 60_000, gcTime: 60_000 }),
	});
	await app.navigator.navigate({ to: "_root_/about", search: { page: "1" } });
	await app.navigator.navigate({ to: "_root_/about", search: { page: "2" } });
	const cached = (search: string) =>
		app.deps.cache.read({ route: "_root_/about", id: `&page=${search}`, layout: false, params: {}, search: {} });
	expect(cached("1")?.data).toBe("fresh");
	expect(cached("2")?.data).toBe("fresh");
	await app.navigator.navigate({ to: "_root_/about", search: { page: "1" } });
	expect(app.deps.fetch).toHaveBeenLastCalledWith(
		"/about?page=1&_flare=data&_flare_stale=%26page%3D1",
		expect.anything(),
	);
});

it("document load", async () => {
	const app = await setup(async () => ndjson(aboutFrames));
	await app.navigator.navigate({ to: "_admin_/panel" });
	expect(app.deps.assign).toHaveBeenCalledExactlyOnceWith("/panel");
	expect(app.deps.fetch).not.toHaveBeenCalled();
});

it("blocked", async () => {
	const app = await setup(async () => ndjson(aboutFrames));
	app.deps.blockers.register(() => false);
	await app.navigator.navigate({ to: "_root_/about" });
	expect(app.deps.fetch).not.toHaveBeenCalled();
	expect(location.pathname).toBe("/");
});

it("chunk import", async () => {
	const app = await setup(async () => ndjson(aboutFrames));
	await app.navigator.navigate({ to: "_root_/lazy" });
	expect(app.deps.reload).toHaveBeenCalledExactlyOnceWith("/lazy");
	expect(location.pathname).toBe("/");
	await app.navigator.navigate({ to: "_root_/broken" });
	expect(app.deps.reload).toHaveBeenCalledOnce();
	expect(location.pathname).toBe("/");
});

it("optional param", async () => {
	const app = await setup(async () =>
		ndjson([{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/tabs/[[tab]]", d: "none" }, { t: "r" }, { t: "d" }]),
	);
	await app.navigator.navigate({ to: "_root_/tabs/[[tab]]" });
	flush();
	expect(app.text()).toBe("root[tabs:none]");
	expect(app.store.snapshot().matches[1].params).toEqual({});
	await app.navigator.navigate({ to: "_root_/tabs/[[tab]]", params: { tab: "x" } });
	expect(app.store.snapshot().matches[1].params).toEqual({ tab: "x" });
});

it("restore", async () => {
	const app = await setup(async () => ndjson(aboutFrames));
	app.deps.blockers.register(() => false);
	const restore = vi.spyOn(app.deps.scroll, "restore");
	const push = vi.spyOn(history, "pushState");
	const replace = vi.spyOn(history, "replaceState");
	await app.navigator.restore("/about", app.deps.history.index());
	flush();
	expect(app.text()).toBe("root[about:fresh]");
	expect(push).not.toHaveBeenCalled();
	expect(replace).not.toHaveBeenCalled();
	expect(restore).toHaveBeenCalledOnce();
	await app.navigator.restore("/about#part", app.deps.history.index());
	expect(app.store.snapshot().location.hash).toBe("#part");
	expect(restore).toHaveBeenCalledTimes(2);
	push.mockRestore();
	replace.mockRestore();
});

it("preloader", async () => {
	const frames: Frame[] = [
		{ t: "l", m: "_root_", d: null, p: { site: "s" } },
		{ t: "l", m: "_root_/about", d: "fresh", p: { site: "s", role: "admin" } },
		{ t: "r" },
	];
	const responses = [ndjson(frames), ndjson(aboutFrames)];
	const app = await setup(async () => responses.shift() ?? ndjson([{ t: "l", m: "_root_", d: null }, { t: "r" }]), {
		cache: createMatchCache({ staleTime: 60_000, gcTime: 60_000 }),
	});
	await app.navigator.navigate({ to: "_root_/about" });
	expect(app.store.snapshot().matches.map((match) => match.preloader)).toEqual([
		{ site: "s" },
		{ site: "s", role: "admin" },
	]);
	await app.navigator.navigate({ to: "_root_/" });
	expect(app.store.snapshot().matches.map((match) => match.preloader)).toEqual([{}, {}]);
	await app.navigator.navigate({ to: "_root_/about" });
	expect(app.store.snapshot().matches[1].preloader).toEqual({ site: "s", role: "admin" });
});

function liveFrames(title: string): Frame[] {
	return [{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/live", d: { title } }, { t: "r" }];
}

it("live hook", async () => {
	const responses = [ndjson(liveFrames("First")), ndjson(liveFrames("Second"))];
	const app = await setup(async () => responses.shift() ?? ndjson(liveFrames("Third")));
	await app.navigator.navigate({ to: "_root_/live" });
	flush();
	expect(app.text()).toBe("root[live:First]");
	const mounted = mounts.live;
	await app.navigator.navigate({ to: "_root_/live" });
	flush();
	expect(app.text()).toBe("root[live:Second]");
	expect(mounts.live).toBe(mounted);
});

it("input output", async () => {
	const output: Frame[] = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/search", d: null, v: { params: {}, search: { page: 2 } } },
		{ t: "r" },
	];
	const homeFrames: Frame[] = [{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/", d: "home" }, { t: "r" }];
	const responses = [ndjson(output), ndjson(homeFrames)];
	const app = await setup(async () => responses.shift() ?? ndjson([{ t: "l", m: "_root_", d: null }, { t: "r" }]), {
		cache: createMatchCache({ staleTime: 60_000, gcTime: 60_000 }),
	});
	await app.navigator.navigate({ to: "_root_/search", search: { page: "2" } });
	flush();
	expect(app.text()).toBe("root[search:number]");
	// A match without `v` keeps the raw record.
	expect(app.store.snapshot().matches[0].search).toEqual({ page: "2" });
	await app.navigator.navigate({ to: "_root_/" });
	// The page is stale-skipped, so it keeps the `v` its cache entry holds.
	await app.navigator.navigate({ to: "_root_/search", search: { page: "2" } });
	flush();
	expect(app.text()).toBe("root[search:number]");
});
