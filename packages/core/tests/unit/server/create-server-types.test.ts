import { describe, expectTypeOf, it } from "vitest";
import type { MiddlewareContext } from "../../../src/middleware/index.ts";
import { createServer } from "../../../src/server/index.ts";
import { buildRouter } from "../../integration/fixtures.ts";

describe("createServer type safety", () => {
	it(".use() is always available (not excluded)", () => {
		const server = createServer(buildRouter())
			.use(async (ctx: MiddlewareContext) => ctx.next())
			.authenticateFn(() => null);

		expectTypeOf(server.use).toBeFunction();
	});

	it(".mount() is always available (not excluded)", () => {
		const server = createServer(buildRouter())
			.mount("/api", () => new Response())
			.authenticateFn(() => null);

		expectTypeOf(server.mount).toBeFunction();
	});

	it("once-only methods excluded after call", () => {
		const server = createServer(buildRouter())
			.use(async (ctx: MiddlewareContext) => ctx.next())
			.authenticateFn(() => null)
			.serverContext(() => ({}))
			.cache({})
			.security({})
			.keepalive({ interval: 5000 })
			.sitemap({ engines: {}, secret: "s", sitemapUrl: "http://localhost/sitemap.xml" });

		expectTypeOf(server.authenticateFn).toBeNever();
		expectTypeOf(server.serverContext).toBeNever();
		expectTypeOf(server.cache).toBeNever();
		expectTypeOf(server.security).toBeNever();
		expectTypeOf(server.keepalive).toBeNever();
		expectTypeOf(server.sitemap).toBeNever();
	});

	it(".fetch() is always available", () => {
		const server = createServer(buildRouter())
			.use(async (ctx: MiddlewareContext) => ctx.next())
			.authenticateFn(() => null);

		expectTypeOf(server.fetch).toBeFunction();
	});

	it("does not have .middlewares()", () => {
		const server = createServer(buildRouter());
		expectTypeOf(server).not.toHaveProperty("middlewares");
	});
});
