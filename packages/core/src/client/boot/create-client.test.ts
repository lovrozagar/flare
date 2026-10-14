import { createComponent, flush, useContext } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InterceptOutlet, Link, type InterceptState } from "../../shared/components/index.ts";
import { encodeFrame, QUERY_GETTER, type Frame } from "../../shared/protocol/index.ts";
import { createServerFn } from "../server-fn/call.ts";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { PrefetchContext, useRouter, type LinkPrefetch } from "../../shared/router/context.ts";
import { createRouter, type Router } from "../../shared/router/create-router.ts";
import { navigate } from "../navigation/active.ts";
import { bootClient, createClient, devSend, type ClientEnv } from "./create-client.ts";
import { createReady, type ReadyContext } from "./ready.ts";

type Dom = typeof globalThis & { _$HY?: unknown; flare?: unknown };

const seen: { router?: Router; prefetcher?: LinkPrefetch | null } = {};

const root = createRootLayout("_root_").render((props) => [
	"root[",
	props.children,
	createComponent(InterceptOutlet, { children: (state: InterceptState) => `|overlay:${state.render}` }),
	"]",
]);
const photo = createPage("_root_/photo")
	.intercept({ from: ["_root_/"], render: "preview" })
	.render(() => "photo");
const home = createPage("_root_/").render((props) => {
	seen.router = useRouter();
	seen.prefetcher = useContext(PrefetchContext);
	return [`home:${String(props.loaderData)}`, createComponent(Link, { to: "_root_/about", children: "" })];
});
const about = createPage("_root_/about").render((props) => `about:${String(props.loaderData)}`);
const broken = createPage("_root_/broken").render(() => {
	throw new Error("render broke");
});

function routerOf(chunks: Record<string, string> = {}): Router {
	return createRouter({
		chunks,
		layouts: { _root_: root },
		routeTree: [
			{ id: "_root_/", path: "/", module: () => Promise.resolve(home) },
			{ id: "_root_/about", path: "/about", module: about },
			{ id: "_root_/broken", path: "/broken", module: broken },
			{ id: "_root_/photo", path: "/photo", module: photo },
			{
				id: "_root_/lazy",
				path: "/lazy",
				module: () => Promise.reject(new TypeError("Failed to fetch dynamically imported module")),
			},
		],
	});
}

const stops: (() => void)[] = [];

function install(build?: string): HTMLElement {
	const matches = [
		{ id: "_root_", params: {}, search: {}, data: null, preloader: {}, head: null, error: null },
		{ id: "_root_/", params: {}, search: {}, data: "start", preloader: {}, head: { title: "Home" }, error: null },
	];
	// jsdom does not run a script set through innerHTML. A browser would, so the test assigns self.flare too.
	const state = build === undefined ? { matches, nonce: "" } : { matches, nonce: "", build };
	document.body.innerHTML = `<script>self.flare=${JSON.stringify(state)}</script><div id="app"></div>`;
	(globalThis as Dom).flare = { ...state };
	return document.getElementById("app") as HTMLElement;
}

function env(host: HTMLElement, fetch: ClientEnv["fetch"] = vi.fn<ClientEnv["fetch"]>()): ClientEnv {
	return {
		mount: (code) => render(code, host),
		fetch,
		assign: vi.fn<(href: string) => void>(),
		dev: false,
		idle: { requestIdle: undefined, setTimeout: (run) => run() },
		network: {},
		observe: () => () => undefined,
	};
}

beforeEach(() => {
	history.replaceState(null, "", "/");
	document.documentElement.removeAttribute("data-flare-hydrated");
});

afterEach(() => {
	for (const stop of stops.splice(0)) stop();
	delete (globalThis as Dom).flare;
});

it("adopts history", async () => {
	const host = install();
	history.replaceState({ index: 4 }, "");
	const length = history.length;
	stops.push(await bootClient(routerOf(), createReady(), env(host)));
	expect(history.length).toBe(length);
	expect(history.state).toEqual({ index: 4 });
});

it("router context", async () => {
	const host = install();
	const router = routerOf();
	stops.push(await bootClient(router, createReady(), env(host)));
	expect(seen.router).toBe(router);
	expect(history.state).toEqual({ index: 0, usr: undefined });
});

it("hydrates matches", async () => {
	const host = install();
	const ready = createReady();
	const order: string[] = [];
	ready.api.onReady(() => order.push(`ready ${document.documentElement.hasAttribute("data-flare-hydrated")}`));
	ready.api.onHydrated(() => order.push(`hydrated ${document.documentElement.hasAttribute("data-flare-hydrated")}`));
	stops.push(await bootClient(routerOf(), ready, env(host)));
	flush();
	expect(host.textContent).toBe("root[home:start]");
	expect(order).toEqual(["ready false", "hydrated true"]);
	await new Promise((resolve) => setTimeout(resolve, 30));
	expect(document.title).toBe("Home");
});

it("keeps capture", async () => {
	const host = install();
	const capture = { events: [], completed: new WeakSet(), r: {}, fe() {} };
	(globalThis as Dom)._$HY = capture;
	stops.push(await bootClient(routerOf(), createReady(), env(host)));
	expect((globalThis as Dom)._$HY).toBe(capture);
});

it("navigates", async () => {
	const host = install();
	const frames = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/about", d: "fresh" },
		{ t: "r" },
		{ t: "d" },
	] as const;
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => new Response(frames.map(encodeFrame).join("")));
	const ready = createReady();
	const navigates: ReadyContext["navigate"][] = [];
	ready.api.onReady((ctx) => navigates.push(ctx.navigate));
	vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
	stops.push(await bootClient(routerOf(), ready, env(host, fetch)));
	await navigates[0]({ to: "_root_/about", hash: "top" });
	flush();
	expect(host.textContent).toBe("root[about:fresh]");
	expect(location.pathname).toBe("/about");
	expect(window.scrollTo).toHaveBeenCalled();
});

// A data answer that lands the about page with this loader data.
function aboutFetch(data: string): ClientEnv["fetch"] {
	const frames: Frame[] = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/about", d: data },
		{ t: "r" },
		{ t: "d" },
	];
	return vi.fn<ClientEnv["fetch"]>(async () => new Response(frames.map(encodeFrame).join("")));
}

// The root `navigate` drives the booted client from outside any component, and stops reaching it once the client is
// disposed (BUGS.md 105).
it("root navigate", async () => {
	const host = install();
	const fetch = aboutFetch("root");
	vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
	const stop = await bootClient(routerOf(), createReady(), env(host, fetch));
	await navigate({ to: "_root_/about" });
	flush();
	expect(host.textContent).toBe("root[about:root]");
	expect(location.pathname).toBe("/about");
	stop();
	await expect(navigate({ to: "_root_/" })).rejects.toThrow("once createClient has booted");
});

// Leaving a page saves its position under the router's `getScrollRestorationKey`, not the history index (BUGS.md 106).
it("scroll key", async () => {
	const host = install();
	const fetch = aboutFetch("keyed");
	vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
	const key = vi.fn<(location: { pathname: string }) => string>((location) => `page:${location.pathname}`);
	sessionStorage.clear();
	stops.push(await bootClient({ ...routerOf(), getScrollRestorationKey: key }, createReady(), env(host, fetch)));
	await navigate({ to: "_root_/about" });
	expect(key).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/" }));
	expect(sessionStorage.getItem("flare_scroll")).toContain("page:/");
});

it("create client", async () => {
	install();
	// The root never loads, so this boot stops before it hydrates the test document.
	const pending = createRouter({ layouts: { _root_: () => new Promise(() => undefined) }, routeTree: [] });
	const api = createClient(pending);
	expect(api.onReady(() => undefined)).toBe(api);
	await Promise.resolve();
	expect(() => api.onIdle(() => undefined)).toThrow(/same turn/);
});

it("dev send", () => {
	expect(devSend(undefined)).toBeUndefined();
	const hot = { send: vi.fn<(event: string, payload: unknown) => void>() };
	const payload = { type: "error" as const, err: { message: "m", stack: "" } };
	devSend(hot)?.(payload);
	expect(hot.send).toHaveBeenCalledExactlyOnceWith("flare:error", payload);
});

it("dev report", async () => {
	const host = install();
	const broke = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/broken", d: null },
		{ t: "r" },
		{ t: "d" },
	] as const;
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => new Response(broke.map(encodeFrame).join("")));
	const send = vi.fn<NonNullable<ClientEnv["send"]>>();
	const ready = createReady();
	const navigates: ReadyContext["navigate"][] = [];
	ready.api.onReady((ctx) => navigates.push(ctx.navigate));
	vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
	stops.push(await bootClient(routerOf(), ready, { ...env(host, fetch), dev: true, send }));
	await navigates[0]({ to: "_root_/broken" });
	flush();
	expect(host.textContent).toBe("root[Something went wrong]");
	expect(send).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({ err: expect.objectContaining({ message: "render broke" }) }),
	);
});

it("chunk reload", async () => {
	const host = install();
	const ready = createReady();
	const navigates: ReadyContext["navigate"][] = [];
	ready.api.onReady((ctx) => navigates.push(ctx.navigate));
	const client = env(host);
	sessionStorage.clear();
	stops.push(await bootClient(routerOf(), ready, client));
	await navigates[0]({ to: "_root_/lazy" });
	expect(client.assign).toHaveBeenCalledExactlyOnceWith("/lazy");
});

it("popstate", async () => {
	const host = install();
	const frames = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/about", d: "back" },
		{ t: "r" },
		{ t: "d" },
	] as const;
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => new Response(frames.map(encodeFrame).join("")));
	vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
	stops.push(await bootClient(routerOf(), createReady(), env(host, fetch)));
	history.pushState({ index: 1 }, "", "/about");
	window.dispatchEvent(new PopStateEvent("popstate", { state: { index: 1 } }));
	await new Promise((resolve) => setTimeout(resolve, 10));
	flush();
	expect(host.textContent).toBe("root[about:back]");
});

it("prefetch all", async () => {
	const host = install();
	const client = env(
		host,
		vi.fn<ClientEnv["fetch"]>(async () => new Response(null, { status: 500 })),
	);
	const chunks = { "_root_/": "/src/home.tsx", "_root_/lazy": "/src/lazy.tsx" };
	stops.push(await bootClient(routerOf(chunks), createReady(), client));
	// The hydrated home's file is loaded already, so only the unloaded route's is prefetched (BUGS.md 80).
	const links = [...document.head.querySelectorAll('link[rel="prefetch"]')];
	expect(links.map((link) => link.getAttribute("href"))).toEqual(["/src/lazy.tsx"]);
	for (const link of links) link.remove();
	const anchor = document.createElement("a");
	seen.prefetcher?.watch(anchor, "/about", "intent");
	anchor.dispatchEvent(new Event("pointerenter"));
	expect(client.fetch).toHaveBeenCalledExactlyOnceWith("/about?_flare=prefetch", expect.anything());
});

it("delegates", async () => {
	const host = install();
	const frames = [{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/about", d: "linked" }, { t: "r" }] as const;
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => new Response(frames.map(encodeFrame).join("")));
	vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
	stops.push(await bootClient(routerOf(), createReady(), env(host, fetch)));
	const anchor = document.createElement("a");
	anchor.setAttribute("href", "/about");
	document.body.append(anchor);
	anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
	await new Promise((resolve) => setTimeout(resolve, 0));
	flush();
	expect(fetch).toHaveBeenCalledWith("/about?_flare=data", expect.anything());
	expect(host.textContent).toBe("root[about:linked]");
});

it("overlay", async () => {
	const host = install();
	const frames = [{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/photo", d: "P" }, { t: "r" }] as const;
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => new Response(frames.map(encodeFrame).join("")));
	const ready = createReady();
	const navigates: ReadyContext["navigate"][] = [];
	ready.api.onReady((ctx) => navigates.push(ctx.navigate));
	stops.push(await bootClient(routerOf(), ready, env(host, fetch)));
	await navigates[0]({ to: "_root_/photo" });
	flush();
	expect(host.textContent).toBe("root[home:start|overlay:preview]");
	expect(history.state).toEqual({ index: 1, usr: undefined, intercepted: true });
});

// bootClient writes the transport onto self.flare: a handler posts and resolves its data (bits/07). The state already
// on self.flare stays.
it("server fn call", async () => {
	const host = install("b1");
	const answers: Record<string, () => Response> = {
		"/_flare/fn/echo": () => Response.json({ name: "echo", status: 200, data: { n: 1 } }),
		"/_flare/fn/moved": () =>
			Response.json({ name: "moved", status: 303, redirect: { to: "/#top", status: 303, replace: true } }),
		"/_flare/fn/stale": () =>
			Response.json({ name: "stale", status: 200, data: 1 }, { headers: { "flare-build": "b2" } }),
	};
	const fetch = vi.fn<ClientEnv["fetch"]>(async (url) => (answers[String(url)] ?? (() => Response.error()))());
	const browser = env(host, fetch);
	stops.push(await bootClient(routerOf(), createReady(), browser));
	const flare = Object((globalThis as Dom).flare);
	const call: unknown = Reflect.get(flare, "call");
	if (typeof call !== "function") throw new Error("no self.flare.call");
	expect(Reflect.get(flare, "nonce")).toBe("");
	const echo = { id: "echo", name: "echo", record: { method: "post", authenticate: false } };
	expect(await Reflect.apply(call, undefined, [echo, { a: 1 }])).toEqual({ n: 1 });
	expect(fetch.mock.calls[0]?.[0]).toBe("/_flare/fn/echo");
	// A same-origin redirect is the internal URL navigation, and the call still rejects.
	const moved = { id: "moved", name: "moved", record: { method: "post", authenticate: false } };
	await expect(Reflect.apply(call, undefined, [moved, null])).rejects.toThrow("HTTP 303");
	await vi.waitFor(() => expect(window.location.hash).toBe("#top"));
	// Another build's answer reloads the page on screen once, under the chunk guard.
	const stale = { id: "stale", name: "stale", record: { method: "post", authenticate: false } };
	await expect(Reflect.apply(call, undefined, [stale, null])).rejects.toThrow("The app was updated");
	expect(browser.assign).toHaveBeenCalledWith(window.location.href);
});

// The client graph's stream function as the boundary transform emits it: the generator is stripped to `undefined`, and
// the booted transport still sends it to the NDJSON reader by its kind (BUGS.md B14). A variable, so the internal
// fields type-check.
it("stream call", async () => {
	const host = install("b1");
	const ndjson = '{"name":"ticks","status":200,"data":1}\n{"name":"ticks","status":200,"data":2}\n';
	const fetch = vi.fn<ClientEnv["fetch"]>(
		async () => new Response(ndjson, { headers: { "content-type": "application/x-ndjson" } }),
	);
	stops.push(await bootClient(routerOf(), createReady(), env(host, fetch)));
	const config = { method: "post" as const, __id: "ticks", __name: "ticks", __client: true };
	const ticks = createServerFn(config).stream(undefined as never);
	const seen: unknown[] = [];
	for await (const value of ticks()) seen.push(value);
	expect(seen).toEqual([1, 2]);
	expect(fetch).toHaveBeenCalledOnce();
	expect(fetch.mock.calls[0]?.[0]).toBe("/_flare/fn/ticks");
});

function echoed(): Response {
	return Response.json({ name: "echo", status: 200, data: 1 });
}

function aboutData(): Response {
	const frames = [encodeFrame({ t: "l", m: "_root_", d: null }), encodeFrame({ t: "l", m: "_root_/about", d: 1 })];
	return new Response([...frames, encodeFrame({ t: "r" })].join(""), {
		headers: { "content-type": "application/x-ndjson" },
	});
}

function tabOf(call: Parameters<ClientEnv["fetch"]> | undefined): string | null {
	return new Headers(call?.[1].headers).get("flare-dev-tab");
}

// In dev the client announces the dev server's tab token and names it on its own requests, so a server bug opens
// the overlay in this tab only. Without a hot channel, as in production, neither happens (dx/plugin.md, B42).
it("dev tab", async () => {
	const echo = { id: "echo", name: "echo", record: { kind: "handler", method: "post", authenticate: false } };
	for (const [hot, meta, token] of [
		[{ send: vi.fn<(event: string, payload: unknown) => void>() }, "T9", "T9"],
		[undefined, "T9", null],
		[{ send: vi.fn<(event: string, payload: unknown) => void>() }, undefined, null],
	] as const) {
		const host = install("b1");
		if (meta !== undefined)
			document.head.insertAdjacentHTML("beforeend", `<meta name="flare-dev-tab" content="${meta}">`);
		const fetch = vi.fn<ClientEnv["fetch"]>(async (url) =>
			String(url).includes("_flare=data") ? aboutData() : echoed(),
		);
		const ready = createReady();
		const navigates: ReadyContext["navigate"][] = [];
		ready.api.onReady((ctx) => navigates.push(ctx.navigate));
		stops.push(await bootClient(routerOf(), ready, { ...env(host, fetch), hot }));
		const call: unknown = Reflect.get(Object((globalThis as Dom).flare), "call");
		if (typeof call !== "function") throw new Error("no self.flare.call");
		await Reflect.apply(call, undefined, [echo, null]);
		await navigates[0]({ to: "_root_/about" });
		expect(fetch.mock.calls.map((seen) => tabOf(seen))).toEqual([token, token]);
		expect(hot?.send.mock.calls ?? []).toEqual(token === null ? [] : [["flare:tab", { token }]]);
		document.head.querySelector('meta[name="flare-dev-tab"]')?.remove();
		for (const stop of stops.splice(0)) stop();
	}
});

// The navigator and the transport read the one id the document wrote: both reload on another build's answer.
it("one build", async () => {
	const host = install("b1");
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => new Response("", { headers: { "flare-build": "b2" } }));
	const ready = createReady();
	const navigates: ReadyContext["navigate"][] = [];
	ready.api.onReady((ctx) => navigates.push(ctx.navigate));
	const browser = env(host, fetch);
	stops.push(await bootClient(routerOf(), ready, browser));
	await navigates[0]({ to: "_root_/about" });
	expect(browser.assign).toHaveBeenCalledWith("/about");
	const call: unknown = Reflect.get(Object((globalThis as Dom).flare), "call");
	if (typeof call !== "function") throw new Error("no self.flare.call");
	const echo = { id: "echo", name: "echo", record: { method: "post", authenticate: false } };
	await expect(Reflect.apply(call, undefined, [echo, null])).rejects.toThrow("The app was updated");
	expect(browser.assign).toHaveBeenLastCalledWith(window.location.href);
});

// The prefetcher checks the same build. A prefetch a newer deploy answered is dropped, so the navigation makes its
// own request, sees the mismatch, and loads the document once instead of committing the other build's frames (B30).
it("prefetch build", async () => {
	const host = install("b1");
	const frames = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/about", d: "newer" },
		{ t: "r" },
		{ t: "d" },
	] as const;
	const body = frames.map(encodeFrame).join("");
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => new Response(body, { headers: { "flare-build": "b2" } }));
	const ready = createReady();
	const navigates: ReadyContext["navigate"][] = [];
	ready.api.onReady((ctx) => navigates.push(ctx.navigate));
	const browser = env(host, fetch);
	sessionStorage.clear();
	stops.push(await bootClient(routerOf(), ready, browser));
	const anchor = document.createElement("a");
	seen.prefetcher?.watch(anchor, "/about", "intent");
	anchor.dispatchEvent(new Event("pointerenter"));
	await new Promise((resolve) => setTimeout(resolve, 0));
	await navigates[0]({ to: "_root_/about" });
	flush();
	expect(browser.assign).toHaveBeenCalledWith("/about");
	expect(host.textContent).not.toContain("newer");
});

// A stored document that left a `"stream"` hole says so in its state. After hydrate the client sends one
// `_flare=fill` revalidation of the same URL, which writes no history (dx/defer.md). The e2e row sees the value land.
it("fill on hydrate", async () => {
	const host = install();
	const filled = { ...Object((globalThis as Dom).flare), fill: true };
	(globalThis as Dom).flare = filled;
	const script = document.querySelector("script");
	if (script !== null) script.textContent = `self.flare=${JSON.stringify(filled)}`;
	const frames = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/", d: "filled" },
		{ t: "r" },
		{ t: "d" },
	] as const;
	const fetch = vi.fn<ClientEnv["fetch"]>(async () => new Response(frames.map(encodeFrame).join("")));
	const length = history.length;
	stops.push(await bootClient(routerOf(), createReady(), env(host, fetch)));
	await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith("/?_flare=fill", expect.anything()));
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(fetch).toHaveBeenCalledOnce();
	expect(history.length).toBe(length);
	expect(location.pathname).toBe("/");
});

// The boot tells the registered query getter the hydration mount is over, once, after the document says so and the
// app's hydrated callbacks ran. With no getter, or one without `hydrated`, the boot completes (B102).
it("query hydrated", async () => {
	const order: string[] = [];
	const hydrated = vi.fn<() => void>(() =>
		order.push(`query ${document.documentElement.hasAttribute("data-flare-hydrated")}`),
	);
	const getter = Object.assign(() => undefined, { dehydrate: () => undefined, hydrated });
	Reflect.set(globalThis, QUERY_GETTER, getter);
	try {
		const ready = createReady();
		ready.api.onHydrated(() => order.push("app hydrated"));
		stops.push(await bootClient(routerOf(), ready, env(install())));
		expect(order).toEqual(["app hydrated", "query true"]);
		expect(hydrated).toHaveBeenCalledOnce();
		Reflect.set(
			globalThis,
			QUERY_GETTER,
			Object.assign(() => undefined, { dehydrate: () => undefined }),
		);
		stops.push(await bootClient(routerOf(), createReady(), env(install())));
	} finally {
		Reflect.deleteProperty(globalThis, QUERY_GETTER);
	}
	stops.push(await bootClient(routerOf(), createReady(), env(install())));
});
