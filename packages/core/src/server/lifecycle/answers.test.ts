import { expect, it, vi } from "vitest";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter, type RouteModule } from "../../shared/router/create-router.ts";
import { createServer } from "./create.ts";
import { NO_STORE } from "./policies.ts";

const root = createRootLayout("_root_").render((props) => props.children);
const cdn = { maxAge: "60s", tags: ["t"] };
const PUBLIC = "public, max-age=0, s-maxage=60, stale-while-revalidate=0";

function serve(page: RouteModule, authenticate: () => unknown): ReturnType<typeof createServer> {
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/p", path: "/p", module: page }] });
	return createServer({ router, authenticate });
}

const get = (path = "/p"): Request => new Request(`http://localhost${path}`);

// The decision and the gate read the same memoized session, so authenticate runs once.
it("one session", async () => {
	const authenticate = vi.fn<() => unknown>(() => ({ userId: "u" }));
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn })
		.authenticateOptional()
		.render(() => "p");
	const response = await serve(page, authenticate).fetch(get());
	expect(response.status).toBe(200);
	expect(response.headers.get("cache-control")).toBe(NO_STORE);
	expect(authenticate).toHaveBeenCalledOnce();
});

it("public chain", async () => {
	const authenticate = vi.fn<() => unknown>(() => null);
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn })
		.render(() => "p");
	const response = await serve(page, authenticate).fetch(get());
	expect(response.headers.get("cache-control")).toBe(PUBLIC);
	expect(authenticate).not.toHaveBeenCalled();
});

// The decision counts a throw as a session. The gate then answers the throw's status.
it("session throw", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn })
		.authenticateOptional()
		.render(() => "p");
	const response = await serve(page, () => {
		throw new Error("store down");
	}).fetch(get());
	expect(response.status).toBe(500);
	expect(response.headers.get("cache-control")).toBe(NO_STORE);
});

// A failed loader on a data request is still HTTP 200, and its `e` frame takes the public header away (B73).
it("data error frame", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn })
		.loader(() => {
			throw new Error("boom");
		})
		.render(() => "p");
	const response = await serve(page, () => null).fetch(get("/p?_flare=data"));
	expect(response.status).toBe(200);
	expect(await response.text()).toContain('"t":"e"');
	expect(response.headers.get("cache-control")).toBe(NO_STORE);
	expect(response.headers.has("cache-tag")).toBe(false);
});
