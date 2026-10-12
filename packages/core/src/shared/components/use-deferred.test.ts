import { createComponent, Loading, type Element } from "solid-js";
import { expect, it } from "vitest";
import { createRouter } from "../router/create-router.ts";
import { renderDocument } from "../../server/render/document.ts";
import { createDefer } from "../../server/loaders/defer.ts";
import type { Deferred } from "../route-builder/register.ts";
import { useDeferred } from "./use-deferred.ts";

const router = createRouter({ layouts: {}, routeTree: [] });

// A slot that reads one deferred value under <Loading>, as dx/defer.md shows.
function slot(deferred: Deferred<string>): Element {
	return createComponent(Loading, {
		fallback: "waiting",
		get children() {
			const value = useDeferred(() => deferred);
			return [() => value()];
		},
	});
}

async function rendered(deferred: Deferred<string>): Promise<{ shell: string; whole: () => Promise<string> }> {
	const body = await renderDocument({
		request: new Request("http://localhost/"),
		router,
		matches: [],
		render: () => slot(deferred),
	});
	const reader = body.getReader();
	const decoder = new TextDecoder();
	const shell = decoder.decode((await reader.read()).value);
	return {
		shell,
		whole: async () => {
			let rest = shell;
			for (let next = await reader.read(); !next.done; next = await reader.read()) rest += decoder.decode(next.value);
			return rest;
		},
	};
}

// A live deferred value is an ordinary async read: the document streams it, and no client boundary is handed over.
it("live value", async () => {
	const held = Promise.withResolvers<string>();
	const live = createDefer({ stored: false, dev: false }).defer(() => held.promise);
	expect(live.hole).toBeUndefined();
	const document = await rendered(live);
	expect(document.shell).toContain("waiting");
	held.resolve("LIVE");
	const whole = await document.whole();
	expect(whole).toContain("LIVE");
	expect(whole).not.toContain("$$f");
});

// A stored `"stream"` value the render did not run is a hole: the server renders the fallback and hands the
// position to the client as a final boundary, so the document ends and hydration never waits on it.
it("stored hole", async () => {
	const hole = createDefer({ stored: true, route: "stream", dev: false }).defer(() => Promise.resolve("never run"));
	expect(hole.hole).toBe(true);
	const document = await rendered(hole);
	const whole = await document.whole();
	expect(whole).toContain("waiting");
	expect(whole).toContain("$$f");
	expect(whole).not.toContain("never run");
});

// A plain deferred value reads the same way, for a caller that holds one outside loader data.
it("plain value", async () => {
	const held = Promise.withResolvers<string>();
	const document = await renderDocument({
		request: new Request("http://localhost/"),
		router,
		matches: [],
		render: () =>
			createComponent(Loading, {
				fallback: "waiting",
				get children() {
					const value = useDeferred(createDefer({ stored: false, dev: false }).defer(() => held.promise));
					return [() => value()];
				},
			}),
	});
	held.resolve("PLAIN");
	expect(await new Response(document).text()).toContain("PLAIN");
});
