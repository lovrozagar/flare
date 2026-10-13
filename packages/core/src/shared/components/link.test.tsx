import { createComponent, createSignal, flush, type Context } from "solid-js";
import { render, type JSX } from "@solidjs/web";
import { afterEach, expect, it, vi } from "vitest";
import { createPrefetcher } from "../../client/navigation/prefetch.ts";
import { createPage } from "../route-builder/page.ts";
import { createRootLayout } from "../route-builder/root-layout.ts";
import type { RouteModule } from "../router/create-router.ts";
import { createRouter } from "../router/create-router.ts";
import {
	LocationContext,
	NavigateContext,
	PrefetchContext,
	RouterContext,
	type LinkPrefetch,
	type NavigateTo,
} from "../router/context.ts";
import type { Location, LocationRewrite } from "../url/index.ts";
import { delegateClicks, Link, type LinkProps } from "./link.tsx";

const root = createRootLayout("_root_").render((props) => props.children);
const about = createPage("_root_/about").render(() => "about");
const importAbout = vi.fn<() => Promise<RouteModule>>(async () => about);
const router = createRouter({
	layouts: { _root_: root },
	routeTree: [
		{ id: "_root_/", path: "/", module: createPage("_root_/").render(() => "home") },
		{ id: "_root_/about", path: "/about", module: importAbout },
		{ id: "_root_/users/[id]", path: "/users/[id]", module: createPage("_root_/users/[id]").render(() => "user") },
	],
});

type Mounted = {
	anchor: HTMLAnchorElement;
	navigate: ReturnType<typeof vi.fn<(options: NavigateTo) => Promise<void>>>;
	place: (location: Partial<Location>) => void;
};

const disposers: (() => void)[] = [];

afterEach(() => {
	for (const dispose of disposers.splice(0)) dispose();
	document.body.replaceChildren();
	vi.unstubAllEnvs();
});

function provide<T>(context: Context<T>, value: T, children: () => JSX.Element): JSX.Element {
	return createComponent(context, {
		value,
		get children() {
			return children();
		},
	});
}

function mount(props: LinkProps, prefetch: LinkPrefetch | null = null): Mounted {
	const [location, setLocation] = createSignal<Location>({ pathname: "/", search: "", hash: "" });
	const navigate = vi.fn<(options: NavigateTo) => Promise<void>>(async () => undefined);
	const host = document.createElement("div");
	document.body.append(host);
	disposers.push(
		render(
			() =>
				provide(RouterContext, router, () =>
					provide(LocationContext, location, () =>
						provide(NavigateContext, navigate, () =>
							provide(PrefetchContext, prefetch, () => createComponent(Link, props)),
						),
					),
				),
			host,
		),
	);
	flush();
	const anchor = host.querySelector("a");
	if (anchor === null) throw new Error("no anchor");
	const place = (next: Partial<Location>) => {
		setLocation({ pathname: "/", search: "", hash: "", ...next });
		flush();
	};
	return { anchor, navigate, place };
}

// The window sees the click last. It records whether Flare took it, then stops jsdom from following the link.
function click(target: EventTarget, init: MouseEventInit = {}): { defaultPrevented: boolean } {
	const seen = { defaultPrevented: false };
	const record = (event: Event): void => {
		seen.defaultPrevented = event.defaultPrevented;
		event.preventDefault();
	};
	window.addEventListener("click", record, { once: true });
	target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
	window.removeEventListener("click", record);
	return seen;
}

function realPrefetch() {
	const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
		async () => new Response(null, { status: 500 }),
	);
	const prefetcher = createPrefetcher({
		router,
		origin: location.origin,
		current: () => ({ pathname: "/", search: "", hash: "" }),
		fetch,
		build: "",
		land: { dev: false },
		env: {
			network: {},
			observe: vi.fn<(element: Element, run: () => void) => () => void>(() => () => undefined),
			idle: () => undefined,
			head: document.head,
			now: () => 0,
		},
	});
	return { prefetcher, fetch };
}

it("href", async () => {
	const { anchor, navigate } = mount({
		to: "_root_/about",
		replace: true,
		scroll: false,
		viewTransition: { types: ["slide"] },
		children: "About",
	});
	expect(anchor.hasAttribute("viewTransition")).toBe(false);
	expect(anchor.getAttribute("href")).toBe("/about");
	expect(anchor.textContent).toBe("About");
	const event = click(anchor);
	expect(event.defaultPrevented).toBe(true);
	expect(navigate).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({ to: "_root_/about", replace: true, scroll: false, viewTransition: { types: ["slide"] } }),
	);
	const guarded = mount({ to: "_root_/about", onClick: (event) => event.preventDefault(), children: "x" });
	click(guarded.anchor);
	expect(guarded.navigate).not.toHaveBeenCalled();
});

it("foreign", () => {
	const watch = vi.fn<LinkPrefetch["watch"]>(() => () => undefined);
	const { anchor, navigate } = mount({ href: "https://evil/", children: "x" }, { watch });
	expect(anchor.getAttribute("href")).toBe("https://evil/");
	const event = click(anchor);
	expect(event.defaultPrevented).toBe(false);
	expect(navigate).not.toHaveBeenCalled();
	expect(watch).not.toHaveBeenCalled();
});

it("intent", async () => {
	const { prefetcher, fetch } = realPrefetch();
	importAbout.mockClear();
	const { anchor } = mount({ to: "_root_/about", prefetch: "intent", children: "x" }, prefetcher);
	expect(fetch).not.toHaveBeenCalled();
	anchor.dispatchEvent(new Event("pointerenter"));
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(importAbout).toHaveBeenCalled();
	expect(fetch).toHaveBeenCalledExactlyOnceWith("/about?_flare=prefetch", expect.anything());
});

it("off", async () => {
	const { prefetcher, fetch } = realPrefetch();
	importAbout.mockClear();
	const { anchor } = mount({ to: "_root_/about", prefetch: false, children: "x" }, prefetcher);
	anchor.dispatchEvent(new Event("pointerenter"));
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(importAbout).not.toHaveBeenCalled();
	expect(fetch).not.toHaveBeenCalled();
});

it("all rejected", () => {
	// @ts-expect-error a link cannot say modules: "all" (B64)
	const all: LinkProps = { to: "_root_/about", prefetch: { modules: "all" }, children: "x" };
	expect(() => mount(all)).toThrow(/modules: "all"/);
	vi.stubEnv("DEV", false);
	expect(mount(all).anchor.getAttribute("href")).toBe("/about");
});

it("dangerous", () => {
	for (const href of ["javascript:alert(1)", "\u0001javascript:alert(1)", " javascript:alert(1)", "data:text/html,x"]) {
		const { anchor, navigate } = mount({ href, children: "x" });
		expect(anchor.getAttribute("href")).toBe("#");
		expect(click(anchor).defaultPrevented).toBe(true);
		expect(navigate).not.toHaveBeenCalled();
	}
});

it("neither", () => {
	// @ts-expect-error a link has `to` or `href`
	const { anchor } = mount({ children: "x" });
	expect(anchor.getAttribute("href")).toBe("#");
});

it("params", () => {
	expect(() => mount({ to: "_root_/users/[id]", children: "x" })).toThrow("id");
	expect(mount({ to: "_root_/users/[id]", params: { id: "7" }, children: "x" }).anchor.getAttribute("href")).toBe(
		"/users/7",
	);
});

// A param is the validator output, and the URL values rule writes it (dx/link.md). Unregistered, params are not
// checked against the route.
it("typed values", () => {
	const { anchor, navigate } = mount({ to: "_root_/users/[id]", params: { id: 7 }, children: "x" });
	expect(anchor.getAttribute("href")).toBe("/users/7");
	click(anchor);
	expect(navigate.mock.calls[0]?.[0]).toMatchObject({ to: "_root_/users/[id]", params: { id: 7 } });
	// @ts-expect-error an external link takes no params
	expect(mount({ href: "https://ex.com/a", params: { id: "1" }, children: "x" }).anchor.href).toBe("https://ex.com/a");
});

it("strips reserved", () => {
	const { anchor } = mount({
		to: "_root_/about",
		search: { _flare: "data", q: "1", _flare_stale: "x" },
		children: "x",
	});
	expect(anchor.getAttribute("href")).toBe("/about?q=1");
});

it("hash", () => {
	expect(mount({ to: "_root_/about", hash: "x", children: "x" }).anchor.getAttribute("href")).toBe("/about#x");
});

it("active", () => {
	const { anchor, place } = mount({
		to: "_root_/about",
		class: "base",
		activeClass: "on",
		inactiveClass: "off",
		activeProps: { "data-state": "active" },
		inactiveProps: { "data-state": "idle" },
		children: "x",
	});
	expect(anchor.className).toBe("base off");
	expect(anchor.hasAttribute("aria-current")).toBe(false);
	expect(anchor.getAttribute("data-state")).toBe("idle");
	place({ pathname: "/about", hash: "#elsewhere" });
	expect(anchor.className).toBe("base on");
	expect(anchor.getAttribute("aria-current")).toBe("page");
	expect(anchor.getAttribute("data-state")).toBe("active");
});

it("is active", () => {
	const isActive = vi.fn<(location: { pathname: string; search: Record<string, string | string[]> }) => boolean>(
		() => true,
	);
	const { anchor, place } = mount({ to: "_root_/about", isActive, activeClass: "on", children: "x" });
	place({ pathname: "/users/7", search: "?q=1" });
	expect(isActive).toHaveBeenLastCalledWith({ pathname: "/users/7", search: { q: "1" } });
	expect(anchor.className).toBe("on");
});

it("active default", () => {
	const { anchor, place } = mount({ to: "_root_/about", search: { q: "1" }, activeClass: "on", children: "x" });
	place({ pathname: "/about", search: "?q=1" });
	expect(anchor.className).toBe("on");
	place({ pathname: "/about/more", search: "?q=1" });
	expect(anchor.className).toBe("");
	place({ pathname: "/about", search: "" });
	expect(anchor.className).toBe("");
});

it("active search order", () => {
	const { anchor, place } = mount({ to: "_root_/about", search: { a: "1", b: "2" }, activeClass: "on", children: "x" });
	place({ pathname: "/about", search: "?b=2&a=1" });
	expect(anchor.className).toBe("on");
	place({ pathname: "/about", search: "?b=2&a=1&a=1" });
	expect(anchor.className).toBe("");
});

it("active prefix", () => {
	const { anchor, place } = mount({ to: "_root_/", activeClass: "on", children: "x" });
	place({ pathname: "/about" });
	expect(anchor.className).toBe("");
	expect(anchor.hasAttribute("aria-current")).toBe(false);
});

it("disabled", () => {
	const watch = vi.fn<LinkPrefetch["watch"]>(() => () => undefined);
	const { anchor, navigate } = mount({ to: "_root_/about", disabled: true, children: "x" }, { watch });
	expect(anchor.tagName).toBe("A");
	expect(anchor.getAttribute("aria-disabled")).toBe("true");
	expect(anchor.getAttribute("tabindex")).toBe("-1");
	expect(click(anchor).defaultPrevented).toBe(true);
	expect(navigate).not.toHaveBeenCalled();
	expect(watch).not.toHaveBeenCalled();
});

// A plain anchor with a child, so a click on the child must find the anchor.
function anchor(attributes: Record<string, string>): HTMLAnchorElement {
	const element = document.createElement("a");
	for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
	element.append(document.createElement("span"));
	document.body.append(element);
	return element;
}

it("delegate", () => {
	const visit = vi.fn<(url: string) => void>();
	const stop = delegateClicks(document, { router, origin: location.origin, visit });
	const followed = click(anchor({ href: "/about?q=1#top" }).firstElementChild ?? document.body);
	expect(followed.defaultPrevented).toBe(true);
	expect(visit).toHaveBeenCalledExactlyOnceWith("/about?q=1#top");
	click(anchor({ href: "/about", target: "_self" }));
	expect(visit).toHaveBeenCalledTimes(2);
	const left = [
		click(anchor({ href: "/about" }), { button: 1 }),
		...(["metaKey", "ctrlKey", "shiftKey", "altKey"] as const).map((key) =>
			click(anchor({ href: "/about" }), { [key]: true }),
		),
		click(anchor({ href: "/about", target: "_blank" })),
		click(anchor({ href: "/about", download: "" })),
		click(anchor({ href: "/about", rel: "nofollow external" })),
		click(anchor({ href: "/about", "data-flare-skip": "" })),
		click(anchor({ href: "https://elsewhere.example/about" })),
		click(anchor({ href: "/nowhere" })),
		click(anchor({})),
		click(document.body),
		click(document),
	];
	const prevented = anchor({ href: "/about" });
	prevented.addEventListener("click", (event) => event.preventDefault());
	click(prevented);
	expect(left.map((event) => event.defaultPrevented)).toEqual(left.map(() => false));
	expect(visit).toHaveBeenCalledTimes(2);
	const linked = mount({ to: "_root_/about", children: "x" });
	click(linked.anchor);
	expect(linked.navigate).toHaveBeenCalledOnce();
	click(linked.anchor, { ctrlKey: true });
	expect(linked.navigate).toHaveBeenCalledOnce();
	expect(visit).toHaveBeenCalledTimes(2);
	stop();
	click(anchor({ href: "/about" }));
	expect(visit).toHaveBeenCalledTimes(2);
});

// The router's rewrite runs once on an anchor's location, before the route check. A throw or another origin
// fails the click: the default is prevented and nothing is visited (dx/router.md, BUGS.md B17).
it("delegate rewrite", () => {
	const rewrite = vi.fn<LocationRewrite>((at) => {
		if (at.pathname.startsWith("/guide/")) return { ...at, pathname: at.pathname.replace("/guide/", "/") };
		if (at.pathname === "/broken") throw new Error("rewrite broke");
		return at.pathname === "/away" ? { pathname: "//elsewhere.example/about", search: "", hash: "" } : undefined;
	});
	const rewriting = createRouter({ layouts: { _root_: root }, routeTree: router.routeTree, rewrite });
	const visit = vi.fn<(url: string) => void>();
	const errors: unknown[] = [];
	const onError = (event: ErrorEvent): void => {
		errors.push(event.error);
		event.preventDefault();
	};
	window.addEventListener("error", onError);
	const stop = delegateClicks(document, { router: rewriting, origin: location.origin, visit });
	expect(click(anchor({ href: "/guide/about?q=1#h" })).defaultPrevented).toBe(true);
	expect(visit).toHaveBeenCalledExactlyOnceWith("/about?q=1#h");
	expect(rewrite).toHaveBeenCalledExactlyOnceWith({ pathname: "/guide/about", search: "?q=1", hash: "#h" });
	expect(click(anchor({ href: "/broken" })).defaultPrevented).toBe(true);
	expect(click(anchor({ href: "/away" })).defaultPrevented).toBe(true);
	expect(visit).toHaveBeenCalledOnce();
	expect(errors.map(String)).toEqual(["Error: rewrite broke", "Error: rewrite: the result is not on this origin"]);
	stop();
	window.removeEventListener("error", onError);
});

it("force", () => {
	const plain = mount({ to: "_root_/about", children: "x" });
	plain.place({ pathname: "/about" });
	expect(click(plain.anchor).defaultPrevented).toBe(true);
	expect(plain.navigate).not.toHaveBeenCalled();
	const forced = mount({ to: "_root_/about", force: true, children: "x" });
	forced.place({ pathname: "/about" });
	click(forced.anchor);
	expect(forced.navigate).toHaveBeenCalledOnce();
	const hashed = mount({ to: "_root_/about", hash: "part", children: "x" });
	hashed.place({ pathname: "/about" });
	click(hashed.anchor);
	expect(hashed.navigate).toHaveBeenCalledOnce();
});

it("blank", () => {
	const { anchor, navigate } = mount({ to: "_root_/about", target: "_blank", children: "x" });
	expect(click(anchor).defaultPrevented).toBe(false);
	expect(navigate).not.toHaveBeenCalled();
});

it("noopener", () => {
	expect(mount({ to: "_root_/about", target: "_blank", children: "x" }).anchor.getAttribute("rel")).toBe(
		"noopener noreferrer",
	);
	expect(mount({ href: "https://x.example/", target: "_blank", rel: "author", children: "x" }).anchor.rel).toBe(
		"author",
	);
	expect(mount({ to: "_root_/about", children: "x" }).anchor.hasAttribute("rel")).toBe(false);
});
