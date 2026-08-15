/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from "vitest";
import type { MiddlewareContext } from "../../../src/middleware/index.ts";

vi.mock("virtual:flare-is-dev", () => ({ default: false }));

import { createServer } from "../../../src/server/index.ts";
import { background } from "../../../src/server-context/index.ts";
import { buildRouter } from "../../integration/fixtures.ts";

function dataReq(path: string): Request {
	return new Request(`http://localhost${path}`, {
		headers: { "x-d": "1" },
	});
}

describe("waitUntil wiring", () => {
	it(".fetch(req, env, { waitUntil }) makes background() delegate to it", async () => {
		const waitUntil = vi.fn();
		let bgPromise: Promise<unknown> | undefined;

		const server = createServer(buildRouter()).use(async (ctx: MiddlewareContext) => {
			bgPromise = Promise.resolve("bg-work");
			background(bgPromise);
			return ctx.next();
		});

		await server.fetch(dataReq("/home"), {}, { waitUntil });
		expect(waitUntil).toHaveBeenCalledWith(bgPromise);
	});

	it("binds waitUntil so Cloudflare's this-check does not throw", async () => {
		const executionCtx = {
			waitUntil(this: unknown, _p: Promise<unknown>) {
				if (this !== executionCtx) {
					throw new TypeError("Illegal invocation: function called with incorrect `this` reference.");
				}
			},
		};

		const server = createServer(buildRouter()).use(async (ctx: MiddlewareContext) => {
			background(Promise.resolve("bg-work"));
			return ctx.next();
		});

		const response = await server.fetch(dataReq("/home"), {}, executionCtx);
		expect(response.status).not.toBe(500);
	});

	it("reused handler binds waitUntil to each request's execution context", async () => {
		const seen: unknown[] = [];
		const makeCtx = () => {
			const executionCtx = {
				waitUntil(this: unknown, _p: Promise<unknown>) {
					if (this !== executionCtx) {
						throw new TypeError("Illegal invocation: function called with incorrect `this` reference.");
					}
					seen.push(this);
				},
			};
			return executionCtx;
		};

		const server = createServer(buildRouter()).use(async (ctx: MiddlewareContext) => {
			background(Promise.resolve("bg-work"));
			return ctx.next();
		});

		const first = makeCtx();
		const second = makeCtx();
		expect((await server.fetch(dataReq("/home"), {}, first)).status).not.toBe(500);
		expect((await server.fetch(dataReq("/home"), {}, second)).status).not.toBe(500);
		expect(seen).toEqual([first, second]);
	});

	it("without third arg background() fire-and-forgets", async () => {
		let bgRan = false;

		const server = createServer(buildRouter()).use(async (ctx: MiddlewareContext) => {
			background(
				new Promise<void>((resolve) => {
					bgRan = true;
					resolve();
				}),
			);
			return ctx.next();
		});

		await server.fetch(dataReq("/home"));
		expect(bgRan).toBe(true);
	});
});
