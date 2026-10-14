import { createComponent, flush } from "solid-js";
import { Dynamic } from "@solidjs/web";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ViewTransitionBoundary } from "../../shared/components/index.ts";
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter } from "../../shared/router/create-router.ts";
import { mountNavigator, unmountAll } from "./navigate.fixture.ts";

// The commit runs inside a view transition, and history is written after it (dx/navigate.md).

const root = createRootLayout("_root_").render((props) => [
	"root[",
	createComponent(ViewTransitionBoundary, {
		get children() {
			return createComponent(Dynamic, {
				component: "main",
				get children() {
					return props.children;
				},
			});
		},
	}),
	"]",
]);
const router = createRouter({
	layouts: { _root_: root },
	viewTransitions: true,
	routeTree: [
		{ id: "_root_/", path: "/", module: createPage("_root_/").render(() => "home") },
		{ id: "_root_/about", path: "/about", module: createPage("_root_/about").render(() => "about") },
	],
});

const aboutFrames: Frame[] = [{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/about", d: "x" }, { t: "r" }];

// `types` is set only when the start got the object form: the plain callback is the default (B119).
type Started = { scope: string; types: string[] | undefined; pushedBeforeUpdate: boolean };

function stubStart(target: Element | Document, started: Started[], name: string): void {
	Object.defineProperty(target, "startViewTransition", {
		configurable: true,
		value: (arg: (() => void) | { update: () => void; types: string[] }) => {
			const length = history.length;
			if (typeof arg === "function") arg();
			else arg.update();
			const types = typeof arg === "function" ? undefined : arg.types;
			started.push({ scope: name, types, pushedBeforeUpdate: history.length !== length });
			const done = Promise.resolve();
			return { updateCallbackDone: done, ready: done, finished: done, skipTransition: () => undefined };
		},
	});
}

beforeEach(() => {
	history.replaceState(null, "", "/");
});

afterEach(() => {
	Reflect.deleteProperty(document, "startViewTransition");
	unmountAll();
});

it("view transition", async () => {
	const app = await mountNavigator(router, async () => new Response(aboutFrames.map(encodeFrame).join("")));
	const started: Started[] = [];
	stubStart(document, started, "document");
	const main = app.host.querySelector("main");
	if (main === null) throw new Error("no main");
	stubStart(main, started, "main");
	const push = vi.spyOn(history, "pushState");
	await app.navigator.navigate({ to: "_root_/about" });
	flush();
	expect(app.text()).toBe("root[about]");
	// The default scope is the document, though a boundary is there (B119 (5)).
	expect(started).toEqual([{ scope: "document", types: undefined, pushedBeforeUpdate: false }]);
	expect(push).toHaveBeenCalledOnce();
	await app.navigator.navigate({
		to: "_root_/about",
		replace: true,
		search: { q: "1" },
		viewTransition: { scope: "auto" },
	});
	expect(started[1]).toEqual({ scope: "main", types: undefined, pushedBeforeUpdate: false });
	await app.navigator.restore("/", 0);
	expect(started[2]).toMatchObject({ types: undefined });
	await app.navigator.navigate({ to: "_root_/about", viewTransition: false });
	expect(started).toHaveLength(3);
	expect(app.text()).toBe("root[about]");
	push.mockRestore();
});

const frames = (id: string): Frame[] => [{ t: "l", m: "_root_", d: null }, { t: "l", m: id, d: "x" }, { t: "r" }];

// A view transition runs its update a frame or more after it starts. A navigation that starts in that window skips the
// older transition, which runs the older update first, as the spec orders it (B17). Only the navigation the user started
// last commits and writes history: the superseded update commits nothing, so history gets no entry for it (BUGS.md 98).
it("superseded update", async () => {
	const pages = createRouter({
		layouts: { _root_: root },
		viewTransitions: true,
		routeTree: [
			{ id: "_root_/", path: "/", module: createPage("_root_/").render(() => "home") },
			{ id: "_root_/a", path: "/a", module: createPage("_root_/a").render(() => "a") },
			{ id: "_root_/b", path: "/b", module: createPage("_root_/b").render(() => "b") },
		],
	});
	const app = await mountNavigator(
		pages,
		async (url) =>
			new Response(
				frames(String(url).includes("/a?") ? "_root_/a" : "_root_/b")
					.map(encodeFrame)
					.join(""),
			),
	);
	let pending: (() => void) | undefined;
	let started = 0;
	Object.defineProperty(document, "startViewTransition", {
		configurable: true,
		value: (update: () => void) => {
			started += 1;
			pending?.();
			const { promise, resolve } = Promise.withResolvers<void>();
			pending = () => {
				pending = undefined;
				update();
				resolve();
			};
			// Skipping a transition whose update has not run still runs it first, as the spec orders.
			return { updateCallbackDone: promise, ready: promise, finished: promise, skipTransition: () => pending?.() };
		},
	});
	const push = vi.spyOn(history, "pushState");
	const first = app.navigator.navigate({ to: "_root_/a", viewTransition: { scope: "document" } });
	await vi.waitFor(() => expect(started).toBe(1));
	const second = app.navigator.navigate({ to: "_root_/b", viewTransition: { scope: "document" } });
	await vi.waitFor(() => expect(started).toBe(2));
	await first;
	pending?.();
	await second;
	flush();
	expect(app.text()).toBe("root[b]");
	expect(location.pathname).toBe("/b");
	expect(push.mock.calls.map((call) => String(call[2]))).toEqual(["/b"]);
	push.mockRestore();
});
