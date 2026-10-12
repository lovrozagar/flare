import { afterEach, expect, it, vi } from "vitest";
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter } from "../../shared/router/create-router.ts";
import { revive, type Pending } from "./frames.ts";
import { mountNavigator, unmountAll } from "./navigate.fixture.ts";
import { arrive } from "./request.ts";
import { resolveUrl } from "./target.ts";

afterEach(unmountAll);

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
