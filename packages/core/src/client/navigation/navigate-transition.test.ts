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

type Started = { scope: string; types: string[]; pushedBeforeUpdate: boolean };

function stubStart(target: Element | Document, started: Started[], name: string): void {
	Object.defineProperty(target, "startViewTransition", {
		configurable: true,
		value: (options: { update: () => void; types: string[] }) => {
			const length = history.length;
			options.update();
			started.push({ scope: name, types: options.types, pushedBeforeUpdate: history.length !== length });
			return { updateCallbackDone: Promise.resolve(), ready: Promise.resolve() };
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
	expect(started).toEqual([{ scope: "main", types: ["forward"], pushedBeforeUpdate: false }]);
	expect(push).toHaveBeenCalledOnce();
	await app.navigator.navigate({
		to: "_root_/about",
		replace: true,
		search: { q: "1" },
		viewTransition: { scope: "document" },
	});
	expect(started[1]).toEqual({ scope: "document", types: ["same"], pushedBeforeUpdate: false });
	await app.navigator.restore("/", 0);
	expect(started[2]).toMatchObject({ types: ["back"] });
	await app.navigator.navigate({ to: "_root_/about", viewTransition: false });
	expect(started).toHaveLength(3);
	expect(app.text()).toBe("root[about]");
	push.mockRestore();
});
