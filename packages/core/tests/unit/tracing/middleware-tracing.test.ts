import { describe, expect, it } from "vitest";
import type { FlareMiddleware, MiddlewareContext } from "../../../src/middleware/index.ts";
import { runMiddlewares } from "../../../src/middleware/index.ts";
import { createTimingTracer } from "../../../src/tracing/timing.ts";

function createCtx(overrides?: Partial<MiddlewareContext>): MiddlewareContext {
	return {
		bypass: (response: Response) => Object.freeze({ response, type: "bypass" as const }),
		env: {},
		error: () => {},
		log: () => {},
		next: () => Promise.resolve(Object.freeze({ type: "next" as const })),
		nonce: "test-nonce",
		onResponse: () => {},
		request: new Request("http://localhost/test"),
		requestType: "page" as const,
		respond: (response: Response) => Object.freeze({ response, type: "respond" as const }),
		serverContext: {},
		url: new URL("http://localhost/test"),
		warn: () => {},
		...overrides,
	};
}

describe("middleware tracing", () => {
	it("produces per-middleware spans with index attribute", async () => {
		const tracer = createTimingTracer();
		const mw1: FlareMiddleware = async (ctx) => ctx.next();
		const mw2: FlareMiddleware = async (ctx) => ctx.next();

		await runMiddlewares([mw1, mw2], createCtx(), tracer);

		const entries = tracer.getEntries();
		expect(entries).toHaveLength(2);
		const names = entries.map((e) => e.name).sort();
		expect(names).toEqual(["flare.middleware.0", "flare.middleware.1"]);
	});

	it("works without tracer (no spans)", async () => {
		const mw: FlareMiddleware = async (ctx) => ctx.next();
		const output = await runMiddlewares([mw], createCtx());
		expect(output.result.type).toBe("next");
	});

	it("span durations are non-negative", async () => {
		const tracer = createTimingTracer();
		const mw: FlareMiddleware = async (ctx) => ctx.next();

		await runMiddlewares([mw], createCtx(), tracer);

		for (const entry of tracer.getEntries()) {
			expect(entry.dur).toBeGreaterThanOrEqual(0);
		}
	});

	it("records spans even when middleware bypasses", async () => {
		const tracer = createTimingTracer();
		const mw: FlareMiddleware = async (ctx) => ctx.bypass(new Response("bypassed"));

		const output = await runMiddlewares([mw], createCtx(), tracer);
		expect(output.result.type).toBe("bypass");

		const entries = tracer.getEntries();
		expect(entries).toHaveLength(1);
		expect(entries[0]?.name).toBe("flare.middleware.0");
	});
});
