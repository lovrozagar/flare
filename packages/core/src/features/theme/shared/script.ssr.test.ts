// @vitest-environment jsdom
import { createComponent } from "solid-js";
import { Dynamic, renderToString, type JSX } from "@solidjs/web";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { withRequest } from "../../../shared/csp/index.ts";
import { RouterContext } from "../../../shared/router/context.ts";
import { createRouter, type Router } from "../../../shared/router/create-router.ts";
import type { ThemeOptions } from "../../../shared/router/features.ts";
import { ThemeScript } from "./script.tsx";

// ThemeScript on Solid's server build, with a jsdom document to run the script in. The client row is script.test.tsx.
const media = vi.hoisted(() => ({ dark: false }));

// Node's own `localStorage` global shadows the document's. The browser has one, the document's, which jsdom holds.
const documentStorage = (globalThis as unknown as { jsdom: { window: Window } }).jsdom.window.localStorage;

beforeEach(() => {
	vi.stubGlobal("localStorage", documentStorage);
	vi.stubGlobal("matchMedia", (query: string) => ({ matches: media.dark, media: query }));
});

afterEach(() => {
	media.dark = false;
	documentStorage.clear();
	document.documentElement.removeAttribute("data-theme");
	document.documentElement.style.colorScheme = "";
	document.head.innerHTML = "";
	vi.unstubAllGlobals();
});

function routerWith(theme?: ThemeOptions): Router {
	return createRouter({ layouts: {}, routeTree: [], ...(theme && { theme }) });
}

function withRouter(router: Router, child: () => JSX.Element): () => JSX.Element {
	return () =>
		createComponent(RouterContext, {
			value: router,
			get children() {
				return child();
			},
		});
}

function serverHtml(router: Router, requestNonce = "n"): string {
	return withRequest({ path: "/", nonce: requestNonce }, () =>
		renderToString(withRouter(router, () => createComponent(ThemeScript, {}))),
	);
}

// Runs the script the server wrote, as the browser would before it shows the body.
function runScript(html: string): void {
	const code = /<script[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
	if (code === undefined) throw new Error("no script");
	Function(code)();
}

function attribute(name = "data-theme"): string | null {
	return document.documentElement.getAttribute(name);
}

it("before paint", () => {
	const html = withRequest({ path: "/", nonce: "n" }, () =>
		renderToString(
			withRouter(routerWith({}), () => [
				createComponent(Dynamic, {
					component: "head",
					get children() {
						return createComponent(ThemeScript, {});
					},
				}),
				createComponent(Dynamic, { component: "body", children: "page" }),
			]),
		),
	);
	expect(html.indexOf("<script")).toBeGreaterThan(-1);
	expect(html.indexOf("<script")).toBeLessThan(html.indexOf("<body"));
	runScript(html);
	expect(attribute()).toBe("light");
});

it("nonce", () => {
	expect(serverHtml(routerWith({}), "r1")).toMatch(/^<script nonce="r1">/);
	expect(serverHtml(routerWith({}), "")).toMatch(/^<script>/);
});

it("system", () => {
	media.dark = true;
	runScript(serverHtml(routerWith({})));
	expect(attribute()).toBe("dark");
	expect(document.documentElement.style.colorScheme).toBe("dark");
});

it("explicit", () => {
	media.dark = true;
	localStorage.setItem("flare.theme", "light");
	runScript(serverHtml(routerWith({})));
	expect(attribute()).toBe("light");
	expect(document.documentElement.style.colorScheme).toBe("light");
});

it("stored system", () => {
	media.dark = true;
	localStorage.setItem("flare.theme", "system");
	runScript(serverHtml(routerWith({ defaultTheme: "light" })));
	expect(attribute()).toBe("dark");
});

it("unknown stored", () => {
	media.dark = true;
	localStorage.setItem("flare.theme", "blue");
	runScript(serverHtml(routerWith({})));
	expect(attribute()).toBe("dark");
	// A value outside this app's themes is the default too, and the attribute name is the config's.
	localStorage.setItem("k", "system");
	runScript(
		serverHtml(
			routerWith({ themes: ["light", "dark"], defaultTheme: "light", storageKey: "k", attribute: "data-mode" }),
		),
	);
	expect(attribute("data-mode")).toBe("light");
	// A throwing storage is an absent value, and a throwing style write is ignored.
	vi.stubGlobal("localStorage", {
		getItem() {
			throw new Error("denied");
		},
	});
	runScript(serverHtml(routerWith({ defaultTheme: "dark" })));
	expect(attribute()).toBe("dark");
});

it("no config", () => {
	expect(() => serverHtml(routerWith())).toThrow(/theme/);
});

it("no props", () => {
	// @ts-expect-error ThemeScript takes no props; the config is the router's
	const props: Parameters<typeof ThemeScript>[0] = { config: {} };
	expect(props).toEqual({ config: {} });
});

it("escape", () => {
	const storageKey = "k</script><script>alert(1)</script>";
	const html = serverHtml(routerWith({ storageKey }));
	expect(html.match(/<\/script>/gi)).toHaveLength(1);
	localStorage.setItem(storageKey, "dark");
	runScript(html);
	expect(attribute()).toBe("dark");
});
