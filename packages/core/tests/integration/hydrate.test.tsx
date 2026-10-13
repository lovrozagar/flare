import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ENGINES, startHarness, type Harness } from "./hydrate.harness.ts";

// A server render hydrated by the client build in a real browser, in every engine (bits/15). Solid's hydration
// messages are the failure. Each tree is compiled into both sides from its source, so it reads only `api` and `side`.
let harness: Harness;

beforeAll(async () => {
	// packages/core, two levels above this file, whatever directory the run started in.
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."));
}, 180_000);

afterAll(async () => {
	await harness.close();
});

describe.each(ENGINES)("%s", { timeout: 30_000 }, (engine) => {
	// The harness is not vacuous: a client tree with one more element than the server's fails it.
	it("harness bites", async () => {
		const result = await harness.hydrate(engine, (api, side) =>
			side === "server" ? [api.h("div", "one")] : [api.h("p", "extra"), api.h("div", "one")],
		);
		expect(result.problems).not.toEqual([]);
	});

	// useNavigationProgress creates the same owners on both sides, so a sibling after it keeps its key (BUGS.md B2).
	it("navigation progress beside a sibling", async () => {
		const result = await harness.hydrate(engine, (api) => {
			function Bar() {
				const progress = api.progress.useNavigationProgress();
				return api.h("div", "bar", () => String(progress.value));
			}
			return [api.solid.createComponent(Bar, {}), api.h("div", "sibling", () => "after")];
		});
		expect(result.problems).toEqual([]);
		expect(result.text).toBe("nullafter");
	});

	// A root that declares its boundary renders and does not fail creates none of them at hydrate (BUGS.md B3).
	it("root boundaries idle", async () => {
		const result = await harness.hydrate(engine, (api) => {
			function Bar() {
				const progress = api.progress.useNavigationProgress();
				return api.h("div", "bar", () => String(progress.value));
			}
			const root = api.rootLayout
				.createRootLayout("_root_")
				.render((props) => [api.solid.createComponent(Bar, {}), api.h("main", "main", () => props.children)])
				.errorRender(() => api.h("h1", "root-error", () => "broke"))
				.notFoundRender(() => api.h("h1", "root-missing", () => "missing"));
			const home = api.page.createPage("_root_/").render(() => "home");
			const matches = [
				{ id: "_root_", kind: "layout", module: root, params: {}, search: {}, data: null },
				{ id: "_root_/", kind: "page", module: home, params: {}, search: {}, data: null },
			] as const;
			return api.solid.createComponent(api.outlet.Matches, {
				state: () => ({ matches: [...matches], onBoundaryError: () => undefined }),
			});
		});
		expect(result.problems).toEqual([]);
		expect(result.html).not.toContain("root-error");
		expect(result.text).toBe("nullhome");
	});
});
