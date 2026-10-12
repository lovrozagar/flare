import { createComponent, type Element } from "solid-js";
import { Dynamic } from "@solidjs/web";
import { afterEach, expect, it, vi, type Mock } from "vitest";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter, type RouteModule } from "../../shared/router/create-router.ts";
import { serveWith } from "../lifecycle/create.ts";
import type { Logger } from "../lifecycle/logger.ts";
import type { FlareStore, FlareStoreEntry } from "./contract.ts";
import { epochKey } from "./epoch.ts";
import { createMemoryStore } from "./memory.ts";
import { newSentinel } from "./nonce.ts";
import { storedPageOf } from "./read.ts";
import type { StoredPage } from "./write.ts";

afterEach(() => {
	vi.useRealTimers();
});

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
const KEY = "static:dev:_root_/p";

// A page whose loader and `.headers()` are counted. `revalidate: "60s"` stores for 120s and turns stale at 60s.
function counted(): { page: RouteModule; loads: Mock<() => void>; headers: Mock<() => void> } {
	const loads = vi.fn<() => void>();
	const headers = vi.fn<() => void>();
	const page = createPage("_root_/p")
		.cache({ isr: { revalidate: "60s" }, cdn: { maxAge: "60s" } })
		.loader(() => {
			loads();
			return { text: "fresh" };
		})
		.headers(() => {
			headers();
			return {};
		})
		.render((props) => props.loaderData.text);
	return { page, loads, headers };
}

function serve(page: RouteModule, store: FlareStore): ReturnType<typeof serveWith> {
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/p", path: "/p", module: page }] });
	return serveWith({ router, site: SITE, store }, { dev: false, log: quiet });
}

const get = (path = "/p", init?: RequestInit): Request => new Request(`${SITE}${path}`, init);

// A stored record built by hand, the way a write would leave it.
function record(page: Partial<StoredPage> = {}, at = 0): FlareStoreEntry {
	const sentinel = newSentinel();
	const html = `<html><head></head><body><script nonce="${sentinel}">x()</script>stored<script nonce="${sentinel}">self.flare={"matches":[],"nonce":"${sentinel}"}</script></body></html>`;
	const data: StoredPage = {
		html,
		ndjson: '{"t":"l","m":"_root_/p","d":{"text":"stored"}}\n{"t":"r"}\n{"t":"d"}\n',
		headers: [],
		security: {},
		sentinel,
		render: "isr",
		...page,
	};
	return { data, storedAt: at, tags: ["t"] };
}

function cspNonce(response: Response): string {
	return /'nonce-([^']+)'/.exec(response.headers.get("content-security-policy") ?? "")?.[1] ?? "";
}

// A fresh entry is served as stored: 200, and neither the loader nor `.headers()` runs.
it("hit", async () => {
	vi.useFakeTimers({ now: 10_000, toFake: ["Date"] });
	const store = createMemoryStore();
	await store.set(KEY, record({}, 10_000));
	const { page, loads, headers } = counted();
	const app = serve(page, store);
	for (const path of ["/p", "/p?_flare=data", "/p?_flare=prefetch"]) {
		const response = await app.fetch(get(path));
		expect(response.status).toBe(200);
		expect(response.headers.get("flare-cache")).toBe("hit");
		expect(response.headers.get("flare-render")).toBe("isr");
		expect(await response.text()).toContain("stored");
	}
	expect(loads).not.toHaveBeenCalled();
	expect(headers).not.toHaveBeenCalled();
});

it("miss", async () => {
	const { page } = counted();
	const response = await serve(page, createMemoryStore()).fetch(get());
	expect(response.headers.get("flare-cache")).toBe("miss");
	expect(await response.text()).toContain("fresh");
});

// A tombstone or a tag epoch at or after the render start, and an entry past its ttl, are misses.
it("tombstone", async () => {
	vi.useFakeTimers({ now: 10_000, toFake: ["Date"] });
	const store = createMemoryStore();
	await store.set(KEY, record({}, 10_000));
	await store.delete(KEY);
	const response = await serve(counted().page, store).fetch(get());
	expect(response.headers.get("flare-cache")).toBe("miss");
});

it("epoch", async () => {
	vi.useFakeTimers({ now: 10_000, toFake: ["Date"] });
	const store = createMemoryStore();
	await store.set(KEY, record({}, 10_000));
	await store.set(epochKey("t"), { data: 10_000, storedAt: 10_000 });
	const response = await serve(counted().page, store).fetch(get());
	expect(response.headers.get("flare-cache")).toBe("miss");
});

it("expired", async () => {
	vi.useFakeTimers({ now: 200_000, toFake: ["Date"] });
	const store = createMemoryStore();
	await store.set(KEY, record({}, 200_000 - 120_000));
	expect((await serve(counted().page, store).fetch(get())).headers.get("flare-cache")).toBe("miss");
});

// Past `stale` and inside the ttl, the stored body is served and one re-render starts in the background.
it("stale serves", async () => {
	vi.useFakeTimers({ now: 100_000, toFake: ["Date"] });
	const store = createMemoryStore();
	await store.set(KEY, record({}, 100_000 - 61_000));
	const set = vi.fn<FlareStore["set"]>(store.set);
	const { page, loads } = counted();
	const response = await serve(page, { ...store, set }).fetch(get());
	expect(response.headers.get("flare-cache")).toBe("hit");
	expect(await response.text()).toContain("stored");
	await vi.waitFor(() => expect(set).toHaveBeenCalledOnce());
	expect(loads).toHaveBeenCalledOnce();
	expect(set.mock.calls[0]?.[1].data).toMatchObject({ html: expect.stringContaining("fresh") });
});

// A hand-built record that holds a Location and a CSP still answers with neither: finalize writes security.
it("no replay", async () => {
	vi.useFakeTimers({ now: 10_000, toFake: ["Date"] });
	const store = createMemoryStore();
	const headers = [
		["location", "https://evil/"],
		["content-security-policy", "default-src *"],
	] as const;
	await store.set(KEY, record({ headers }, 10_000));
	const response = await serve(counted().page, store).fetch(get());
	expect(response.headers.has("location")).toBe(false);
	expect(response.headers.get("content-security-policy")).not.toBe("default-src *");
});

// Only replayable headers come back. Cache-Control and Cache-Tag come from the current decision.
it("replay", async () => {
	vi.useFakeTimers({ now: 10_000, toFake: ["Date"] });
	const store = createMemoryStore();
	const headers = [
		["x-robots-tag", "noindex"],
		["set-cookie", "a=1"],
		["cache-control", "public, max-age=999"],
		["x-frame-options", "ALLOWALL"],
	] as const;
	await store.set(KEY, record({ headers }, 10_000));
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.render(() => "p");
	const response = await serve(page, store).fetch(get());
	expect(response.headers.get("x-robots-tag")).toBe("noindex");
	expect(response.headers.getSetCookie()).toEqual([]);
	expect(response.headers.get("x-frame-options")).toBe("DENY");
	expect(response.headers.get("cache-control")).toBe("private, no-store");
});

// A refresh that throws keeps the previous entry and frees the slot, so the next stale hit tries again.
it("refresh fails", async () => {
	vi.useFakeTimers({ now: 100_000, toFake: ["Date"] });
	const store = createMemoryStore();
	await store.set(KEY, record({}, 100_000 - 61_000));
	const loads = vi.fn<() => never>(() => {
		throw new Error("refresh broke");
	});
	const page = createPage("_root_/p")
		.cache({ isr: { revalidate: "60s" } })
		.loader(loads)
		.render(() => "p");
	const app = serve(page, store);
	await app.fetch(get());
	await vi.waitFor(() => expect(loads).toHaveBeenCalledOnce());
	await new Promise((resolve) => setTimeout(resolve, 10));
	expect((await store.get(KEY))?.data).toMatchObject({ html: expect.stringContaining("stored") });
	await app.fetch(get());
	await vi.waitFor(() => expect(loads).toHaveBeenCalledTimes(2));
});

// A hit is always 200 with no ETag, whatever the request's conditional header says.
it("no etag", async () => {
	vi.useFakeTimers({ now: 100_000, toFake: ["Date"] });
	const store = createMemoryStore();
	await store.set(KEY, record({}, 100_000 - 61_000));
	const response = await serve(counted().page, store).fetch(get("/p", { headers: { "if-none-match": '"x"' } }));
	expect(response.status).toBe(200);
	expect(response.headers.has("etag")).toBe(false);
	expect(response.headers.get("flare-cache")).toBe("hit");
});

// The entry's sentinel becomes this request's nonce, in the attributes, the state field, and the CSP header.
it("hit nonce", async () => {
	vi.useFakeTimers({ now: 10_000, toFake: ["Date"] });
	const store = createMemoryStore();
	await store.set(KEY, record({}, 10_000));
	const response = await serve(counted().page, store).fetch(get());
	const nonce = cspNonce(response);
	const body = await response.text();
	expect(nonce).not.toBe("");
	expect(body).toContain(`<script nonce="${nonce}">x()</script>`);
	expect(body).toContain(`"nonce":"${nonce}"`);
	expect(body).not.toContain("__FLARE_NONCE_");
});

// A record that is not a stored page is a miss, whatever a store hands back. A page's fields are kept as typed.
it("bad record", async () => {
	vi.useFakeTimers({ now: 10_000, toFake: ["Date"] });
	const good = record({ headers: [["x-a", "1"]], security: { "X-Frame-Options": "SAMEORIGIN" } }).data as StoredPage;
	for (const bad of [null, "page", { ...good, html: 1 }, { ...good, ndjson: 1 }, { ...good, sentinel: 1 }]) {
		expect(storedPageOf(bad)).toBeUndefined();
	}
	expect(storedPageOf({ ...good, render: "csr" })).toBeUndefined();
	expect(storedPageOf({ ...good, headers: "x" })).toBeUndefined();
	const loose = { ...good, headers: [["x-a", "1"], ["x-b"], "x", ["x-c", 2]], security: { "X-Frame-Options": 1 } };
	expect(storedPageOf(loose)).toEqual({ ...good, headers: [["x-a", "1"]], security: {} });
	expect(storedPageOf({ ...good, security: null })?.security).toEqual({});
	expect(storedPageOf({ ...good, render: "ssr", security: { "Content-Security-Policy": false } })).toMatchObject({
		render: "ssr",
		security: { "Content-Security-Policy": false },
	});
	const store = createMemoryStore();
	await store.set(KEY, { data: { html: "not a page" }, storedAt: 10_000 });
	expect((await serve(counted().page, store).fetch(get())).headers.get("flare-cache")).toBe("miss");
});
