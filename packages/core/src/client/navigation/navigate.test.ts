import { createComponent, createMemo, Errored, flush, Loading } from "solid-js";
import { render, type JSX } from "@solidjs/web";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Matches } from "../../shared/components/index.ts";
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts";
import { createPage } from "../../shared/route-builder/page.ts";
import type { Deferred } from "../../shared/route-builder/register.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter, loadChain } from "../../shared/router/create-router.ts";
import { createHistory } from "../history/index.ts";
import { createMatchCache } from "../router/match-cache.ts";
import { createRouterStore, snapshotFromState, type ScriptMatch } from "../router/store.ts";
import { createBlockers } from "./blocker.ts";
import { createNavigator, type Landing, type NavigatorDeps } from "./navigate.ts";
import { createNavigationState } from "./pending.ts";
import { createScroll } from "./scroll.ts";

const root = createRootLayout("_root_").render((props) => ["root[", props.children, "]"]);
// A refresh keeps the component mounted, so the text reads loaderData reactively.
const home = createPage("_root_/").render((props) => [() => `home:${String(props.loaderData)}`]);
const about = createPage("_root_/about").render((props) => `about:${String(props.loaderData)}`);
type Slots = { fast: Deferred<string>; slow: Deferred<string> };

function slot(deferred: Deferred<string>, fallback: string): JSX.Element {
	return createComponent(Loading, {
		fallback,
		get children() {
			const value = createMemo(async () => deferred.promise);
			return [() => value()];
		},
	});
}

const slotted = createPage("_root_/slots")
	.render((props) => {
		const data = props.loaderData as Slots;
		return [slot(data.fast, "wait-fast"), "|", slot(data.slow, "wait-slow")];
	})
	.errorRender(() => "page-error");
const caught = createPage("_root_/caught").render((props) => {
	const data = props.loaderData as Slots;
	return [
		createComponent(Errored, {
			fallback: () => "caught",
			get children() {
				return slot(data.fast, "wait-fast");
			},
		}),
		"|",
		slot(data.slow, "wait-slow"),
	];
});
const escaped = createPage("_root_/escaped").render((props) => {
	const data = props.loaderData as Slots;
	return [slot(data.fast, "wait-fast"), "|", slot(data.slow, "wait-slow")];
});

const tabs = createPage("_root_/tabs/[[tab]]").render((props) => `tabs:${String(props.loaderData)}`);
const router = createRouter({
	layouts: { _root_: root, _admin_: root },
	routeTree: [
		{ id: "_root_/", path: "/", module: home },
		{ id: "_root_/about", path: "/about", module: about },
		{ id: "_root_/tabs/[[tab]]", path: "/tabs/[[tab]]", module: tabs },
		{ id: "_root_/slots", path: "/slots", module: slotted },
		{ id: "_root_/caught", path: "/caught", module: caught },
		{ id: "_root_/escaped", path: "/escaped", module: escaped },
		{
			id: "_root_/lazy",
			path: "/lazy",
			module: () => Promise.reject(new TypeError("Failed to fetch dynamically imported module")),
		},
		{ id: "_admin_/panel", path: "/panel", module: about },
	],
});

const unmounts: (() => void)[] = [];

beforeEach(() => {
	history.replaceState(null, "", "/");
	sessionStorage.clear();
});

afterEach(() => {
	for (const unmount of unmounts.splice(0)) unmount();
});

function ndjson(frames: readonly Frame[], headers: Record<string, string> = {}): Response {
	return new Response(frames.map(encodeFrame).join(""), {
		headers: { "content-type": "application/x-ndjson", ...headers },
	});
}

const aboutFrames: Frame[] = [
	{ t: "l", m: "_root_", d: null },
	{ t: "l", m: "_root_/about", d: "fresh" },
	{ t: "r" },
	{ t: "d" },
];

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

function entry(id: string, data: unknown): ScriptMatch {
	return { id, params: {}, search: {}, data, preloader: {}, head: null, error: null };
}

async function settled(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
	flush();
}

async function setup(
	fetch: Fetch,
	extra: Partial<NavigatorDeps> = {},
	onBoundaryError: (error: unknown) => void = () => undefined,
) {
	const chain = await loadChain(router.match("/").chain);
	const location = { pathname: "/", search: "", hash: "" };
	const store = createRouterStore(
		snapshotFromState({ matches: [entry("_root_", null), entry("_root_/", "start")], chain, unknown: false, location }),
		onBoundaryError,
	);
	const host = document.createElement("div");
	unmounts.push(render(() => createComponent(Matches, { state: store.outlet }), host));
	flush();
	const flareHistory = createHistory(history);
	flareHistory.adopt();
	const deps: NavigatorDeps = {
		router,
		store,
		history: flareHistory,
		scroll: createScroll(
			{ enabled: true, behavior: "instant", maxEntries: 50 },
			{
				history: { scrollRestoration: "auto" },
				storage: sessionStorage,
				position: () => ({ x: 0, y: 0 }),
				scrollTo: () => undefined,
				element: () => null,
			},
		),
		blockers: createBlockers(),
		navigation: createNavigationState(),
		cache: createMatchCache({ staleTime: 0, gcTime: 60_000 }),
		fetch: vi.fn<Fetch>(fetch),
		origin: location.pathname === "/" ? globalThis.location.origin : "",
		assign: vi.fn<(href: string) => void>(),
		reload: vi.fn<(href: string) => boolean>(() => true),
		build: "b1",
		dev: false,
		...extra,
	};
	const navigator = createNavigator(deps);
	const text = (): string => host.textContent ?? "";
	return { deps, navigator, host, text, settled, store };
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
	const app = await setup(async () => ndjson(aboutFrames), {
		cache: createMatchCache({ staleTime: 60_000, gcTime: 60_000 }),
	});
	await app.navigator.navigate({ to: "_root_/about" });
	await app.navigator.navigate({ to: "_root_/" });
	await app.navigator.navigate({ to: "_root_/about" });
	expect(app.deps.fetch).toHaveBeenLastCalledWith("/about?_flare=data&_flare_stale=%26", expect.anything());
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

// A data response the test writes into frame by frame.
function streamed(route: string): { response: Response; write: (frame: Frame) => void; close: () => void } {
	const encoder = new TextEncoder();
	let controller!: ReadableStreamDefaultController<Uint8Array>;
	const body = new ReadableStream<Uint8Array>({ start: (opened) => void (controller = opened) });
	const write = (frame: Frame): void => controller.enqueue(encoder.encode(encodeFrame(frame)));
	write({ t: "l", m: "_root_", d: null });
	write({ t: "l", m: route, d: { fast: { __deferred: true, key: "d0" }, slow: { __deferred: true, key: "d1" } } });
	return {
		response: new Response(body, { headers: { "content-type": "application/x-ndjson" } }),
		write,
		close: () => controller.close(),
	};
}

it("two slots", async () => {
	const data = streamed("_root_/slots");
	const app = await setup(async () => data.response);
	const pushes: string[] = [];
	const push = vi.spyOn(history, "pushState").mockImplementation(function (this: History, ...args) {
		pushes.push(app.text());
		History.prototype.pushState.apply(this, args);
	});
	const navigated = app.navigator.navigate({ to: "_root_/slots" });
	data.write({ t: "r" });
	await navigated;
	await settled();
	expect(pushes).toEqual(["root[wait-fast|wait-slow]"]);
	data.write({ t: "c", m: "_root_/slots", k: "d0", d: "FAST" });
	await settled();
	expect(app.text()).toBe("root[FAST|wait-slow]");
	data.write({ t: "c", m: "_root_/slots", k: "d1", d: "SLOW" });
	data.write({ t: "d" });
	data.close();
	await settled();
	expect(app.text()).toBe("root[FAST|SLOW]");
	expect(pushes).toHaveLength(1);
	push.mockRestore();
});

it("slot catches", async () => {
	const data = streamed("_root_/caught");
	const send = vi.fn<(error: unknown) => void>();
	const app = await setup(async () => data.response, {}, send);
	const navigated = app.navigator.navigate({ to: "_root_/caught" });
	data.write({ t: "r" });
	await navigated;
	data.write({ t: "e", m: "_root_/caught", k: "d0", e: { message: "fast failed", digest: "0" } });
	data.write({ t: "c", m: "_root_/caught", k: "d1", d: "SLOW" });
	data.close();
	await settled();
	await settled();
	expect(app.text()).toBe("root[caught|SLOW]");
	expect(send).not.toHaveBeenCalled();
});

it("slot escapes", async () => {
	const data = streamed("_root_/escaped");
	const send = vi.fn<(error: unknown) => void>();
	const app = await setup(async () => data.response, {}, send);
	const navigated = app.navigator.navigate({ to: "_root_/escaped" });
	data.write({ t: "r" });
	await navigated;
	data.write({ t: "e", m: "_root_/escaped", k: "d0", e: { message: "fast failed", digest: "0" } });
	data.close();
	await settled();
	await settled();
	expect(app.text()).toBe("root[Something went wrong]");
	// The slow value never came either, so it rejects when the stream ends: a second report.
	expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({ message: "fast failed" }));
});

it("restore", async () => {
	const app = await setup(async () => ndjson(aboutFrames));
	app.deps.blockers.register(() => false);
	const restore = vi.spyOn(app.deps.scroll, "restore");
	const push = vi.spyOn(history, "pushState");
	const replace = vi.spyOn(history, "replaceState");
	await app.navigator.restore("/about");
	flush();
	expect(app.text()).toBe("root[about:fresh]");
	expect(push).not.toHaveBeenCalled();
	expect(replace).not.toHaveBeenCalled();
	expect(restore).toHaveBeenCalledOnce();
	await app.navigator.restore("/about#part");
	expect(app.store.snapshot().location.hash).toBe("#part");
	expect(restore).toHaveBeenCalledTimes(2);
	push.mockRestore();
	replace.mockRestore();
});
