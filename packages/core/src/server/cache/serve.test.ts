import { createComponent, createMemo, Loading, type Element } from "solid-js";
import { Dynamic } from "@solidjs/web";
import { expect, it, vi, type Mock } from "vitest";
import { notFound } from "../../shared/errors/http.ts";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter, type RouteModule } from "../../shared/router/create-router.ts";
import { serveWith } from "../lifecycle/create.ts";
import type { Logger } from "../lifecycle/logger.ts";
import type { FlareStore } from "./contract.ts";
import { createMemoryStore } from "./memory.ts";

function noop(): void {}

const quiet: Logger = { level: "error", error: noop, warn: noop, log: noop };

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
const SITE = "https://example.com";
const PUBLIC = "public, max-age=0, s-maxage=60, stale-while-revalidate=0";

// One page at /p. `store: false` serves it with no store.
function serve(page: RouteModule, store = true): { app: ReturnType<typeof serveWith>; set: Mock<FlareStore["set"]> } {
	const memory = createMemoryStore();
	const set = vi.fn<FlareStore["set"]>(memory.set);
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/p", path: "/p", module: page }] });
	const options = store ? { router, site: SITE, store: { ...memory, set } } : { router, site: SITE };
	return { app: serveWith(options, { dev: false, log: quiet }), set };
}

const get = (path = "/p"): Request => new Request(`${SITE}${path}`);

// Long enough for a background write to have run.
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

// A shared page with no store renders live: no shared render, and no `flare-cache`.
it("no store", async () => {
	const seen: string[] = [];
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn: { maxAge: "60s" } })
		.loader(({ request }) => void seen.push(request.url))
		.render(() => "p");
	const response = await serve(page, false).app.fetch(get("/p?q=1"));
	expect(response.headers.get("cache-control")).toBe(PUBLIC);
	expect(response.headers.has("flare-cache")).toBe(false);
	expect(seen).toEqual([`${SITE}/p?q=1`]);
});

// A data request's miss runs the same shared render and serves the NDJSON it stored.
it("data miss", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn: { maxAge: "60s" } })
		.loader(() => ({ text: "p" }))
		.render(() => "p");
	const { app, set } = serve(page);
	for (const path of ["/p?_flare=data", "/p?_flare=prefetch"]) {
		const response = await app.fetch(get(path));
		const body = await response.text();
		expect(response.headers.get("content-type")).toContain("ndjson");
		expect(response.headers.get("flare-cache")).toBe("miss");
		expect(response.headers.get("cache-control")).toBe(PUBLIC);
		await vi.waitFor(() => expect(set).toHaveBeenCalled());
		const entry = set.mock.calls.at(-1)?.[1];
		expect(entry?.data).toMatchObject({ ndjson: body });
	}
});

// A shared render that is not a clean 200 answers as a live one would and stores nothing.
it("not stored", async () => {
	const missing = createPage("_root_/p")
		.cache({ isr: true })
		.loader(() => notFound())
		.render(() => "p");
	const { app, set } = serve(missing);
	expect((await app.fetch(get())).status).toBe(404);
	expect((await app.fetch(get("/p?_flare=data"))).status).toBe(404);
	const broken = createPage("_root_/p")
		.cache({ isr: true })
		.render(() => {
			throw new Error("render broke");
		});
	const failing = serve(broken);
	expect((await failing.app.fetch(get())).status).toBe(500);
	await settle();
	expect(set).not.toHaveBeenCalled();
	expect(failing.set).not.toHaveBeenCalled();
});

function slot(read: () => Promise<unknown>): Element {
	return createComponent(Loading, {
		fallback: "waiting",
		get children() {
			const value = createMemo(async () => read());
			return [() => String(value())];
		},
	});
}

// A "resolve" value that rejects is not stored, and the answer leaves private, as a deferred error frame does.
it("rejected resolve", async () => {
	const page = createPage("_root_/p")
		.cache({ isr: true, cdn: { maxAge: "60s" } })
		.loader(({ defer }) => ({ late: defer(() => Promise.reject(new Error("late"))) }))
		.render((props) => slot(() => props.loaderData.late.promise.catch(() => "fallback")));
	const { app, set } = serve(page);
	for (const path of ["/p", "/p?_flare=data"]) {
		const response = await app.fetch(get(path));
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
	}
	await settle();
	expect(set).not.toHaveBeenCalled();
});
