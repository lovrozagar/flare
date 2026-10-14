import { expect, it } from "vitest";
import { createTestServer } from "../../src/testing/index.ts";
import { router } from "../e2e/apps/docs/src/router.ts";
import { e2eBoot } from "../e2e/apps/docs/src/stats-gate.ts";

// The public test helper over the docs app's router (dx/testing.md). The docs register declares `serverContext`, so
// the helper takes it, and a loader that reads `serverCtx()` works (BUGS.md B25).
it("create test server", async () => {
	const upstream = { fetch: (input: string | URL | Request) => globalThis.fetch(input), calls: () => 0 };
	const server = createTestServer(router, { serverContext: () => ({ requestId: "test", upstream }) });
	const text = await server.fetch("http://localhost/llms.txt");
	expect(text.status).toBe(200);
	expect(await text.text()).toMatch(/^# Flare docs/);
	const literal = await server.fetch("http://localhost/[flare]?_flare=data");
	expect(literal.status).toBe(200);
	expect(literal.headers.get("content-type")).toMatch(/^application\/x-ndjson/);
});

// The changelog's e2e gate answers only under the e2e boot's FLARE_E2E, from the fetch env or the process env, so a
// deployed docs app refuses it (BUGS.md 69).
it("stats gate refused", () => {
	expect(process.env["FLARE_E2E"]).toBeUndefined();
	expect(e2eBoot({})).toBe(false);
	expect(e2eBoot(undefined)).toBe(false);
	expect(e2eBoot({ FLARE_E2E: "1" })).toBe(true);
	process.env["FLARE_E2E"] = "1";
	try {
		expect(e2eBoot({})).toBe(true);
	} finally {
		delete process.env["FLARE_E2E"];
	}
});
