import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter } from "../../shared/router/create-router.ts";
import { mountNavigator, unmountAll, type Fetch } from "./navigate.fixture.ts";

// A stored page's `"stream"` holes are filled by one `_flare=fill` revalidation of the same URL (dx/defer.md).

const root = createRootLayout("_root_").render((props) => ["root[", props.children, "]"]);
const home = createPage("_root_/").render((props) => [() => `home:${String(props.loaderData)}`]);
const about = createPage("_root_/about").render((props) => `about:${String(props.loaderData)}`);
const router = createRouter({
	layouts: { _root_: root },
	routeTree: [
		{ id: "_root_/", path: "/", module: home },
		{ id: "_root_/about", path: "/about", module: about },
	],
});

beforeEach(() => {
	history.replaceState(null, "", "/");
	sessionStorage.clear();
});

afterEach(unmountAll);

function ndjson(frames: readonly Frame[]): Response {
	return new Response(frames.map(encodeFrame).join(""), { headers: { "content-type": "application/x-ndjson" } });
}

function setup(fetch: Fetch) {
	return mountNavigator(router, fetch, { extra: {} });
}

function deferred(key: string) {
	return { __deferred: true, key };
}

// A stored data response can end with a placeholder no frame settled: a `"stream"` hole. The navigator then asks for
// the values with one `_flare=fill` revalidation of the same URL, which writes no history (dx/defer.md).
it("fill on hole landing", async () => {
	const holed: Frame[] = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/about", d: { __deferred: true, key: "d0" } },
		{ t: "r" },
		{ t: "d" },
	];
	const filled: Frame[] = [...holed.slice(0, 3), { t: "c", m: "_root_/about", k: "d0", d: "late" }, { t: "d" }];
	const responses = [ndjson(holed), ndjson(filled)];
	const app = await setup(async () => responses.shift() ?? ndjson(filled));
	const length = history.length;
	await app.navigator.navigate({ to: "_root_/about" });
	await vi.waitFor(() => expect(app.deps.fetch).toHaveBeenLastCalledWith("/about?_flare=fill", expect.anything()));
	expect(app.deps.fetch).toHaveBeenCalledTimes(2);
	expect(history.length).toBe(length + 1);
	expect(location.pathname).toBe("/about");
});

// A hole heard after the user has left the page asks for nothing: the fill only revalidates the page on screen.
it("no fill after leaving", async () => {
	const later: { close: () => void } = { close: () => undefined };
	const open = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			for (const frame of [
				{ t: "l", m: "_root_", d: null },
				{ t: "l", m: "_root_/about", d: { __deferred: true, key: "d0" } },
				{ t: "r" },
			] as const)
				controller.enqueue(encoder.encode(encodeFrame(frame)));
			later.close = () => {
				controller.enqueue(encoder.encode(encodeFrame({ t: "d" })));
				controller.close();
			};
		},
	});
	const home: Frame[] = [{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/", d: "back" }, { t: "r" }, { t: "d" }];
	const responses = [new Response(open), ndjson(home)];
	const app = await setup(async () => responses.shift() ?? ndjson(home));
	await app.navigator.navigate({ to: "_root_/about" });
	await app.navigator.navigate({ to: "_root_/" });
	later.close();
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(app.deps.fetch).toHaveBeenCalledTimes(2);
	expect(location.pathname).toBe("/");
});

// The fill commits once its response has ended, when every value it carries is in: a commit while one was pending would
// be held for it, silently, with any other write behind it (BUGS.md 89).
it("fill commits at its end", async () => {
	const later: { close: () => void } = { close: () => undefined };
	const open = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			for (const frame of [
				{ t: "l", m: "_root_", d: "fresh" },
				{ t: "l", m: "_root_/about", d: { stats: deferred("stats") } },
				{ t: "r" },
			] as const)
				controller.enqueue(encoder.encode(encodeFrame(frame)));
			later.close = () => {
				controller.enqueue(encoder.encode(encodeFrame({ t: "c", m: "_root_/about", k: "stats", d: 37 })));
				controller.enqueue(encoder.encode(encodeFrame({ t: "d" })));
				controller.close();
			};
		},
	});
	const holed: Frame[] = [
		{ t: "l", m: "_root_", d: "stored" },
		{ t: "l", m: "_root_/about", d: { stats: deferred("stats") } },
		{ t: "r" },
		{ t: "d" },
	];
	const responses = [ndjson(holed), new Response(open)];
	const app = await setup(async () => responses.shift() ?? ndjson(holed));
	await app.navigator.navigate({ to: "_root_/about" });
	await vi.waitFor(() => expect(responses).toEqual([]));
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(app.store.snapshot().matches[0]?.data).toBe("stored");
	later.close();
	await vi.waitFor(() => expect(app.store.snapshot().matches[0]?.data).toBe("fresh"));
});
