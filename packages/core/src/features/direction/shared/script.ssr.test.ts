// @vitest-environment jsdom
import { createComponent } from "solid-js";
import { renderToString, type JSX } from "@solidjs/web";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { withRequest } from "../../../shared/csp/index.ts";
import { RouterContext } from "../../../shared/router/context.ts";
import { createRouter, type Router } from "../../../shared/router/create-router.ts";
import type { DirectionOptions } from "../../../shared/router/features.ts";
import { DirectionScript } from "./script.tsx";

// DirectionScript on Solid's server build, with a jsdom document to run the script in. The client row is
// script.test.tsx.

// Node's own `localStorage` global shadows the document's. The browser has one, the document's, which jsdom holds.
const documentStorage = (globalThis as unknown as { jsdom: { window: Window } }).jsdom.window.localStorage;

beforeEach(() => {
	vi.stubGlobal("localStorage", documentStorage);
});

afterEach(() => {
	documentStorage.clear();
	document.documentElement.removeAttribute("dir");
	document.documentElement.removeAttribute("data-dir");
	vi.unstubAllGlobals();
});

function routerWith(direction?: DirectionOptions): Router {
	return createRouter({ layouts: {}, routeTree: [], ...(direction && { direction }) });
}

function serverHtml(router: Router, locale?: string, requestNonce = "n"): string {
	const props = locale === undefined ? {} : { locale };
	const tree = (): JSX.Element =>
		createComponent(RouterContext, {
			value: router,
			get children() {
				return createComponent(DirectionScript, props);
			},
		});
	return withRequest({ path: "/", nonce: requestNonce }, () => renderToString(tree));
}

// Runs the script the server wrote, as the browser would before it shows the body.
function runScript(html: string): string {
	const code = /<script[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
	if (code === undefined) throw new Error("no script");
	Function(code)();
	return code;
}

it("attr", () => {
	const html = serverHtml(routerWith({}), "ar");
	expect(html).toMatch(/^<script nonce="n">/);
	expect(serverHtml(routerWith({}), "ar", "")).toMatch(/^<script>/);
	expect(runScript(html)).not.toContain("Intl");
	expect(document.documentElement.getAttribute("dir")).toBe("rtl");
	// No locale is the default dir.
	runScript(serverHtml(routerWith({ defaultDir: "rtl" })));
	expect(document.documentElement.getAttribute("dir")).toBe("rtl");
	runScript(serverHtml(routerWith({}), "en"));
	expect(document.documentElement.getAttribute("dir")).toBe("ltr");
});

it("stored wins", () => {
	documentStorage.setItem("flare.dir", "ltr");
	runScript(serverHtml(routerWith({}), "ar"));
	expect(document.documentElement.getAttribute("dir")).toBe("ltr");
	// A stored value other than ltr or rtl, and a throwing storage, are absent.
	documentStorage.setItem("flare.dir", "auto");
	runScript(serverHtml(routerWith({}), "ar"));
	expect(document.documentElement.getAttribute("dir")).toBe("rtl");
	vi.stubGlobal("localStorage", {
		getItem() {
			throw new Error("denied");
		},
	});
	runScript(serverHtml(routerWith({}), "en"));
	expect(document.documentElement.getAttribute("dir")).toBe("ltr");
});

it("data attr", () => {
	runScript(serverHtml(routerWith({ attribute: "data-dir" }), "ar"));
	expect(document.documentElement.getAttribute("data-dir")).toBe("rtl");
	expect(document.documentElement.getAttribute("dir")).toBe("rtl");
});

it("no config", () => {
	expect(() => serverHtml(routerWith(), "ar")).toThrow(/direction/);
});

it("escape", () => {
	const storageKey = "k</script><script>alert(1)</script>";
	const html = serverHtml(routerWith({ storageKey }), "en");
	expect(html.match(/<\/script>/gi)).toHaveLength(1);
	documentStorage.setItem(storageKey, "rtl");
	runScript(html);
	expect(document.documentElement.getAttribute("dir")).toBe("rtl");
});
