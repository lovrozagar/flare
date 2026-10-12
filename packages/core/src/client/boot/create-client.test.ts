import { createComponent, flush, useContext } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InterceptOutlet, Link, type InterceptState } from "../../shared/components/index.ts";
import { encodeFrame } from "../../shared/protocol/index.ts";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { PrefetchContext, useRouter, type LinkPrefetch } from "../../shared/router/context.ts";
import { createRouter, type Router } from "../../shared/router/create-router.ts";
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

function install(): HTMLElement {
	const matches = [
		{ id: "_root_", params: {}, search: {}, data: null, preloader: {}, head: null, error: null },
		{ id: "_root_/", params: {}, search: {}, data: "start", preloader: {}, head: { title: "Home" }, error: null },
	];
	// jsdom does not run a script set through innerHTML. A browser would, so the test assigns self.flare too.
	document.body.innerHTML = `<script>self.flare=${JSON.stringify({ matches, nonce: "" })}</script><div id="app"></div>`;
	(globalThis as Dom).flare = { matches, nonce: "" };
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
	stops.push(await bootClient(routerOf({ "_root_/about": "/src/about.tsx" }), createReady(), client));
	const links = [...document.head.querySelectorAll('link[rel="prefetch"]')];
	expect(links.map((link) => link.getAttribute("href"))).toEqual(["/src/about.tsx"]);
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
