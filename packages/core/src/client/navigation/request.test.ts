import { flush } from "solid-js";
import { afterEach, expect, it, vi } from "vitest";
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter } from "../../shared/router/create-router.ts";
import { revive, type Pending } from "./frames.ts";
import { mountNavigator, unmountAll } from "./navigate.fixture.ts";
import { arrive } from "./request.ts";
import { resolveUrl } from "./target.ts";

afterEach(() => {
	unmountAll();
	vi.restoreAllMocks();
});

const router = createRouter({
	layouts: { _root_: createRootLayout("_root_").render((props) => props.children) },
	routeTree: [
		{ id: "_root_/", path: "/", module: createPage("_root_/").render(() => "home") },
		{ id: "_root_/p", path: "/p", module: createPage("_root_/p").render(() => "p") },
	],
});

const ndjson = (frames: readonly Frame[]): Response => new Response(frames.map(encodeFrame).join(""));

// A fill asks for the same URL as `_flare=fill`, and its `c` frame settles the slot the stored hole left, so a read
// that holds the first value sees the fill's (dx/defer.md).
it("fill request", async () => {
	const frames: Frame[] = [
		{ t: "l", m: "_root_/p", d: { late: { __deferred: true, key: "d0" } } },
		{ t: "r" },
		{ t: "c", m: "_root_/p", k: "d0", d: "late" },
		{ t: "d" },
	];
	const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => ndjson(frames));
	const app = await mountNavigator(router, fetch);
	const pending: Pending = new Map();
	const held = revive({ late: { __deferred: true, key: "d0", hole: true } }, "_root_/p", pending);
	expect(held).toMatchObject({ late: { __deferred: true, key: "d0", hole: true } });
	const target = resolveUrl("/p", { router, origin: "http://localhost", current: app.store.snapshot().location });
	if (target.kind !== "data") throw new Error("a data target");
	const trip = {
		target,
		options: { to: "/p" },
		trigger: "revalidation" as const,
		signal: new AbortController().signal,
	};
	await arrive(app.deps, { ...trip, fill: true, reuse: pending });
	expect(fetch).toHaveBeenCalledWith("/p?_flare=fill", expect.anything());
	const promise: unknown = Reflect.get(Object(Reflect.get(Object(held), "late")), "promise");
	await expect(promise).resolves.toBe("late");
});

// A 200 body that is not frames is logged and loads the target as a document, and the screen stays put until that load
// (BUGS.md 123).
it("unreadable body", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
	const app = await mountNavigator(router, async () => new Response("not a frame\n"));
	await app.navigator.navigate({ to: "_root_/p" });
	flush();
	expect(app.deps.reload).toHaveBeenCalledExactlyOnceWith("/p");
	expect(logged).toHaveBeenCalledExactlyOnceWith(
		"[flare] a client navigation failed; loading the page instead",
		expect.anything(),
	);
	expect(app.host.textContent).toBe("home");
});

// A body that breaks because a newer navigation aborted its trip is neither logged nor loaded: that navigation decides
// (BUGS.md 121, 123).
it("aborted body", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
	const answers = [
		(signal: AbortSignal) =>
			new Response(
				new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(new TextEncoder().encode(encodeFrame({ t: "l", m: "_root_/p", d: null })));
						signal.addEventListener("abort", () => controller.error(signal.reason));
					},
				}),
			),
		() => ndjson([{ t: "l", m: "_root_/p", d: null }, { t: "r" }, { t: "d" }]),
	];
	const app = await mountNavigator(router, async (_url, init) => {
		const answer = answers.shift();
		if (answer === undefined || init.signal === null || init.signal === undefined) throw new Error("one answer each");
		return answer(init.signal);
	});
	const first = app.navigator.navigate({ to: "_root_/p" });
	await new Promise((resolve) => setTimeout(resolve, 0));
	await app.navigator.navigate({ to: "_root_/p", revalidate: true });
	await first;
	flush();
	expect(app.deps.reload).not.toHaveBeenCalled();
	expect(logged).not.toHaveBeenCalled();
	expect(app.host.textContent).toBe("p");
});
