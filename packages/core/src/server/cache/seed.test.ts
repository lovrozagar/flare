import { createComponent, type Element } from "solid-js";
import { Dynamic } from "@solidjs/web";
import { expect, it, vi } from "vitest";
import { artifactPath } from "../../shared/cache/index.ts";
import type { ParamsFn } from "../../shared/route-builder/chain.ts";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter, type RouteModule } from "../../shared/router/create-router.ts";
import { serveWith } from "../lifecycle/create.ts";
import type { Logger } from "../lifecycle/logger.ts";
import { createAssetsStore } from "./assets.ts";
import type { FlareStore } from "./contract.ts";
import { createMemoryStore } from "./memory.ts";
import { epochKey, keyEpochKey } from "./epoch.ts";
import { acceptSeed, listed, seedLookup } from "./seed.ts";

it("valid", () => {
	expect(acceptSeed({ seed: true, renderedAt: 5, tags: ["a"], data: "page" })).toEqual({
		data: "page",
		tags: ["a"],
		storedAt: 5,
	});
});

it("no flag", () => {
	expect(acceptSeed({ renderedAt: 5, tags: ["a"], data: "page" })).toBeUndefined();
	expect(acceptSeed(null)).toBeUndefined();
	expect(acceptSeed({ seed: true, renderedAt: "5", tags: [], data: "page" })).toBeUndefined();
});

it("no tags", () => {
	expect(acceptSeed({ seed: true, renderedAt: 5, data: "page" })).toBeUndefined();
	expect(acceptSeed({ seed: true, renderedAt: 5, tags: [1], data: "page" })).toBeUndefined();
});

it("empty tags", () => {
	expect(acceptSeed({ seed: true, renderedAt: 5, tags: [], data: "page" })).toEqual({
		data: "page",
		tags: [],
		storedAt: 5,
	});
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

const SITE = "https://example.com";
const root = createRootLayout("_root_").render((props) => documentOf(props.children));

// A seed file as prerender writes it, holding a stored page.
function seedFile(text: string, renderedAt: number, render: "isr" | "ssg"): Uint8Array {
	const sentinel = "__FLARE_NONCE_11111111111111111111111111111111";
	const html = `<html><head></head><body>${text}<script nonce="${sentinel}">self.flare={"matches":[],"nonce":"${sentinel}"}</script></body></html>`;
	const data = { html, ndjson: '{"t":"r"}\n{"t":"d"}\n', headers: [], security: {}, sentinel, render };
	return new TextEncoder().encode(JSON.stringify({ seed: true, renderedAt, tags: [], data }));
}

type Served = { app: ReturnType<typeof serveWith>; store: FlareStore; set: ReturnType<typeof vi.fn>; reads: string[] };

// One page at `path`, a watched mutable store, and seeds served from a map of artifact paths.
function serve(page: RouteModule, at: { id: string; path: string; seeds: Record<string, Uint8Array> }): Served {
	const reads: string[] = [];
	const files = new Map(Object.entries(at.seeds));
	const seeds = createAssetsStore(async (file) => {
		reads.push(file);
		return files.get(file) ?? null;
	});
	const memory = createMemoryStore();
	const set = vi.fn<FlareStore["set"]>(memory.set);
	const store = { ...memory, set };
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: at.id, path: at.path, module: page }] });
	const app = serveWith({ router, site: SITE, store, static: seeds }, { dev: false, log: quiet });
	return { app, store, set, reads };
}

const pathOf = (key: string): string => artifactPath(key, { build: "dev" }) ?? "";

// A purge `get` hides an ISR seed unless the seed was rendered after it (B86).
it("purged beats seed", async () => {
	const key = "static:dev:_root_/p";
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.render(() => "live");
	for (const [renderedAt, expected] of [
		[1000, "live"],
		[1001, "seeded"],
	] as const) {
		const { app, store } = serve(page, {
			id: "_root_/p",
			path: "/p",
			seeds: { [pathOf(key)]: seedFile("seeded", renderedAt, "isr") },
		});
		vi.useFakeTimers({ now: 1000, toFake: ["Date"] });
		await store.delete(key);
		vi.setSystemTime(2000);
		const body = await (await app.fetch(new Request(`${SITE}/p`))).text();
		vi.useRealTimers();
		expect(body).toContain(expected);
	}
});

const slugs = () => [{ slug: "a" }];

// SSG checks `params()` on each request: a slug it did not return is the normal 404, document and data alike.
it("absent slug", async () => {
	const page = createPage("_root_/post/[slug]")
		.cache({ ssg: slugs })
		.render(() => "post");
	const { app, set } = serve(page, { id: "_root_/post/[slug]", path: "/post/[slug]", seeds: {} });
	expect((await app.fetch(new Request(`${SITE}/post/b`))).status).toBe(404);
	expect((await app.fetch(new Request(`${SITE}/post/b?_flare=data`))).status).toBe(404);
	expect(set).not.toHaveBeenCalled();
});

// A listed slug whose seed file is missing renders live once, and nothing is written anywhere.
it("missing file", async () => {
	const page = createPage("_root_/post/[slug]")
		.cache({ ssg: { params: slugs } })
		.render(() => "rendered live");
	const { app, set, reads } = serve(page, { id: "_root_/post/[slug]", path: "/post/[slug]", seeds: {} });
	const response = await app.fetch(new Request(`${SITE}/post/a`));
	expect(response.status).toBe(200);
	expect(await response.text()).toContain("rendered live");
	expect(reads).toEqual([pathOf("static:dev:_root_/post/[slug]:a")]);
	await new Promise((resolve) => setTimeout(resolve, 10));
	expect(set).not.toHaveBeenCalled();
});

// SSG reads only the static seed. A tombstone in the mutable store does not hide it.
it("ssg ignores tombstone", async () => {
	const key = "static:dev:_root_/about";
	const page = createPage("_root_/about")
		.cache({ ssg: true })
		.render(() => "live");
	const { app, store } = serve(page, {
		id: "_root_/about",
		path: "/about",
		seeds: { [pathOf(key)]: seedFile("seeded", 1, "ssg") },
	});
	await store.delete(key);
	const response = await app.fetch(new Request(`${SITE}/about`));
	expect(response.headers.get("flare-cache")).toBe("hit");
	expect(response.headers.get("flare-render")).toBe("ssg");
	expect(await response.text()).toContain("seeded");
});

const paths: ParamsFn = (): Record<string, string | string[]>[] => [{ path: ["a", "b"] }, { lang: "en", slug: "x" }];

// A listed entry matches when each of its own params equals the URL's: a catch-all by its joined segments, and a
// param the URL lacks never matches. A page that lists nothing takes any slug.
it("listed slugs", async () => {
	const cache = { ssg: { params: paths } };
	expect(await listed(cache, { path: ["a", "b"] })).toBe(true);
	expect(await listed(cache, { path: ["a"] })).toBe(false);
	expect(await listed(cache, { slug: "x" })).toBe(false);
	expect(await listed(cache, { lang: "en", slug: "x" })).toBe(true);
	expect(await listed({ isr: { params: paths } }, { path: "z" })).toBe(true);
	expect(await listed({ isr: { params: paths, dynamicParams: false } }, { path: "z" })).toBe(false);
	expect(await listed(undefined, {})).toBe(true);
});

// An ISR seed is read only as a stand-in. A missing seed, one no newer than the store's record, and one a key or
// tag epoch has passed give no hit.
it("seed epochs", async () => {
	const key = "static:dev:_root_/p";
	const seeds = createAssetsStore(async () => seedFile("seeded", 100, "isr"));
	const store = createMemoryStore();
	expect(
		await seedLookup(
			createAssetsStore(async () => null),
			{ store, key, looked: null },
		),
	).toBeNull();
	const older = { entry: { data: null, storedAt: 100 }, purged: false };
	expect(await seedLookup(seeds, { store, key, looked: older })).toBeNull();
	expect((await seedLookup(seeds, { store, key, looked: null }))?.purged).toBe(false);
	await store.set(keyEpochKey(key), { data: 100, storedAt: 100 });
	expect((await seedLookup(seeds, { store, key, looked: null }))?.purged).toBe(true);
	const tagged = createAssetsStore(async () =>
		new TextEncoder().encode(JSON.stringify({ seed: true, renderedAt: 200, tags: ["t"], data: null })),
	);
	await store.set(epochKey("t"), { data: 300, storedAt: 300 });
	expect((await seedLookup(tagged, { store, key, looked: null }))?.purged).toBe(true);
	// A static store of the app's own may hand back an entry with no tags.
	const untagged = { ...createMemoryStore(), get: async () => ({ data: null, storedAt: 500 }) };
	expect((await seedLookup(untagged, { store, key, looked: null }))?.purged).toBe(false);
});

// `authorize` runs before a static seed is read, as before a stored one (B73).
it("ssg authorize", async () => {
	const key = "static:dev:_root_/about";
	const page = createPage("_root_/about")
		.cache({ ssg: true })
		.authorize(() => false)
		.render(() => "live");
	const { app } = serve(page, {
		id: "_root_/about",
		path: "/about",
		seeds: { [pathOf(key)]: seedFile("SEEDED", 1, "ssg") },
	});
	const response = await app.fetch(new Request(`${SITE}/about`));
	expect(response.status).toBe(403);
	expect(await response.text()).not.toContain("SEEDED");
});
