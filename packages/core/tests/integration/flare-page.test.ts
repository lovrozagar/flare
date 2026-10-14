import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { flarePage, type FlareState } from "../../src/testing/index.ts";
import { ENGINES, startHarness, type Api, type Engine, type Harness } from "./hydrate.harness.ts";

// flarePage over a real Playwright page in every engine (B96, dx/testing.md): the harness serves a document the real
// `createServer(...).fetch` answers and the real `createClient` hydrates, and the helper loads it again, reads its
// console, and reads its `self.flare`. One harness boot serves the file.
let harness: Harness | undefined;

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."));
}, 180_000);

afterAll(async () => {
	await harness?.close();
});

function started(): Harness {
	if (harness === undefined) throw new Error("the harness did not start");
	return harness;
}

// A root and a page with loader data, built on both sides from this source.
function app(api: Api): { router: unknown } {
	const root = api.rootLayout.createRootLayout("_root_").render((props) => props.children);
	const home = api.page
		.createPage("_root_/")
		.loader(() => ({ greeting: "hello" }))
		.render(() => "home");
	const routeTree = [{ id: "_root_/", path: "/", module: home }];
	return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree }) };
}

type Seen = { hydrated: boolean; errors: string[]; state: FlareState | undefined };

// The helper on the harness's page: `load` goes to the page again and resolves once `<html data-flare-hydrated>` is
// set, `consoleErrors` holds what the page logged as an error since the helper was made, and `state` reads
// `self.flare`. The page's client logs one error after hydrate, which the helper must have seen.
async function helperOn(engine: Engine): Promise<Seen> {
	const seen: Seen = { hydrated: false, errors: [], state: undefined };
	await started().app(engine, {
		app,
		client(client) {
			client.onHydrated(() => console.error("planted error"));
		},
		async steps(tab) {
			const helper = flarePage(tab);
			await helper.load(new URL("/", tab.url()).href);
			seen.hydrated = await tab.evaluate(() => document.documentElement.hasAttribute("data-flare-hydrated"));
			seen.errors = helper.consoleErrors();
			seen.state = await helper.state();
		},
	});
	return seen;
}

describe.each(ENGINES)("%s", { timeout: 30_000 }, (engine) => {
	it("helper on a real page", async () => {
		const seen = await helperOn(engine);
		expect(seen.hydrated).toBe(true);
		expect(seen.errors).toContain("planted error");
		expect(seen.state?.build).toBe("dev");
		expect(typeof seen.state?.nonce).toBe("string");
		expect(seen.state?.matches.map((match) => match.id)).toEqual(["_root_", "_root_/"]);
		expect(seen.state?.matches[1]?.data).toEqual({ greeting: "hello" });
		expect(seen.state?.queries).toBeNull();
	});
});
