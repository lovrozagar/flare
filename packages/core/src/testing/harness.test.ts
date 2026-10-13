import { createComponent, type Element } from "solid-js";
import { Dynamic } from "@solidjs/web";
import { expect, it } from "vitest";
import { createPage } from "../shared/route-builder/page.ts";
import { createRootLayout } from "../shared/route-builder/root-layout.ts";
import { createRouter } from "../shared/router/create-router.ts";
import { createTestServer } from "./harness.ts";

function documentOf(children: Element): Element {
	return createComponent(Dynamic, {
		component: "html",
		get children() {
			return [
				createComponent(Dynamic, { component: "head" }),
				createComponent(Dynamic, { component: "body", children }),
			];
		},
	});
}

// The minimal app's shape: a root layout and one page.
const router = createRouter({
	layouts: { _root_: createRootLayout("_root_").render((props) => documentOf(props.children)) },
	routeTree: [{ id: "_root_/", path: "/", module: createPage("_root_/").render(() => "minimal home") }],
});

it("boots", async () => {
	const server = createTestServer(router);
	const home = await server.fetch("/");
	expect(home.status).toBe(200);
	expect(home.headers.get("content-type")).toMatch(/^text\/html/);
	expect(await home.text()).toContain("minimal home");
	// A URL and a Request work too, and a missing page is the router's 404.
	expect((await server.fetch(new URL("http://localhost/"))).status).toBe(200);
	expect((await server.fetch(new Request("http://localhost/missing"))).status).toBe(404);
	expect((await server.fetch("/", { method: "HEAD" })).status).toBe(200);
});

it("no options", () => {
	// @ts-expect-error createTestServer takes the router only
	expect(() => createTestServer(router, { site: "https://example.com" })).toThrow(
		"createTestServer takes the router only. Call createServer for site, store, authenticate, or locale",
	);
});
