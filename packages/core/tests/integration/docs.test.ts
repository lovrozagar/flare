import { expect, it } from "vitest";
import { createTestServer } from "../../src/testing/index.ts";
import { router } from "../e2e/apps/docs/src/router.ts";

// The public test helper over the docs app's router (dx/testing.md). It passes no serverContext, so it reaches the
// routes that do not read `serverCtx()`.
it("create test server", async () => {
	const server = createTestServer(router);
	const text = await server.fetch("http://localhost/llms.txt");
	expect(text.status).toBe(200);
	expect(await text.text()).toMatch(/^# Flare docs/);
	const literal = await server.fetch("http://localhost/[flare]?_flare=data");
	expect(literal.status).toBe(200);
	expect(literal.headers.get("content-type")).toMatch(/^application\/x-ndjson/);
});
