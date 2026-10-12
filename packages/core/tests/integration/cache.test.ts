import { createComponent, type Element } from "solid-js";
import { Dynamic } from "@solidjs/web";
import { expect, it, vi, type Mock } from "vitest";
import type { FlareStore } from "../../src/server/cache/contract.ts";
import { createMemoryStore } from "../../src/server/cache/memory.ts";
import { createServer } from "../../src/server/lifecycle/create.ts";
import { createPage } from "../../src/shared/route-builder/page.ts";
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts";
import { createRouter, type RouteModule } from "../../src/shared/router/create-router.ts";

const SITE = "https://example.com";

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

const root = createRootLayout("_root_").render((props) => documentOf(props.children));

// One page at /p over a memory store whose writes are watched.
function serve(page: RouteModule): {
	app: ReturnType<typeof createServer>;
	store: FlareStore;
	set: Mock<FlareStore["set"]>;
} {
	const memory = createMemoryStore();
	const set = vi.fn<FlareStore["set"]>(memory.set);
	const store = { ...memory, set };
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/p", path: "/p", module: page }] });
	return { app: createServer({ router, site: SITE, store }), store, set };
}

// A cookie the route sets without `allowCookies` makes the answer private, and nothing is stored (dx/cache.md).
it("set-cookie", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn: { maxAge: "60s" } })
		.headers(() => ({ "set-cookie": "r=1" }))
		.render(() => "p");
	const { app, set } = serve(page);
	const response = await app.fetch(new Request(`${SITE}/p`));
	expect(response.headers.get("cache-control")).toBe("private, no-store");
	expect(response.headers.getSetCookie()).toEqual(["r=1"]);
	await new Promise((resolve) => setTimeout(resolve, 10));
	expect(set).not.toHaveBeenCalled();
});
