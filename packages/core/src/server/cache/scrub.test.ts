import { createComponent, type Element } from "solid-js";
import { Dynamic } from "@solidjs/web";
import { expect, it, vi } from "vitest";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter } from "../../shared/router/create-router.ts";
import { createServer } from "../lifecycle/create.ts";
import type { FlareStore, FlareStoreEntry } from "./contract.ts";
import { createMemoryStore } from "./memory.ts";
import { sharedRequest } from "./scrub.ts";
import type { StoredPage } from "./write.ts";

// The populate request carries no credential, and no other request header either (dx/cache.md).
it("no cookie", () => {
	const request = new Request("https://evil/p?q=1", { headers: { cookie: "s=1", authorization: "Bearer t" } });
	const shared = sharedRequest("https://example.com", request);
	expect(shared.url).toBe("https://example.com/p");
	expect(shared.headers.get("cookie")).toBeNull();
	expect(shared.headers.get("authorization")).toBeNull();
	expect([...shared.headers.keys()]).toEqual([]);
});

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

// The decision reads the real request's session once. The shared render calls no authenticate: its session is null,
// so the stored body is the anonymous render (B27).
it("anonymous render", async () => {
	const authenticate = vi.fn<() => unknown>(() => null);
	const seen: unknown[] = [];
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.authenticateOptional()
		.loader(({ auth }) => {
			seen.push(auth);
			return { who: auth === null ? "anonymous" : "someone" };
		})
		.render((props) => props.loaderData.who);
	const store = createMemoryStore();
	const set = vi.fn<FlareStore["set"]>(store.set);
	const app = createServer({
		router: createRouter({
			layouts: { _root_: createRootLayout("_root_").render((props) => documentOf(props.children)) },
			routeTree: [{ id: "_root_/p", path: "/p", module: page }],
		}),
		authenticate,
		site: "https://example.com",
		store: { ...store, set },
	});
	await app.fetch(new Request("https://example.com/p", { headers: { cookie: "s=1" } }));
	await vi.waitFor(() => expect(set).toHaveBeenCalled());
	const entry = set.mock.calls.at(-1)?.[1] as FlareStoreEntry;
	expect((entry.data as StoredPage).html).toContain("anonymous");
	expect(seen).toEqual([null]);
	expect(authenticate).toHaveBeenCalledOnce();
});
