import { expect, it } from "vitest";
import { createServer } from "../../server/lifecycle/create.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter } from "../../shared/router/create-router.ts";
import { createBunFetch } from "./serve.ts";

it("body limit", async () => {
	let seen = "";
	const built = createBunFetch({
		bodyLimit: 1024,
		fetch(request) {
			seen = new URL(request.url).pathname;
			return new Response("ok");
		},
	});
	expect(built.maxRequestBodySize).toBe(1024);
	const response = await built.fetch(new Request("http://localhost/page"));
	expect(seen).toBe("/page");
	expect(await response.text()).toBe("ok");
});

it("default", () => {
	const built = createBunFetch({ fetch: () => new Response("ok") });
	expect(built.maxRequestBodySize).toBe(1024 * 1024);
});

// The cap Bun enforces is the one createServer was given, read off the server it returns, and createServer checks the
// range dx/server.md gives (BUGS.md 110).
it("server limit", () => {
	const root = createRootLayout("_root_").render((props) => props.children);
	const router = createRouter({ layouts: { _root_: root }, routeTree: [] });
	expect(createBunFetch(createServer({ router, bodyLimit: 2048 })).maxRequestBodySize).toBe(2048);
	expect(createBunFetch(createServer({ router })).maxRequestBodySize).toBe(1024 * 1024);
	expect(createServer({ router, bodyLimit: 32 * 1024 * 1024 }).bodyLimit).toBe(32 * 1024 * 1024);
	for (const bodyLimit of [0, 1.5, 32 * 1024 * 1024 + 1]) {
		expect(() => createServer({ router, bodyLimit })).toThrow("bodyLimit is an integer from 1 to 33554432 bytes");
	}
});
