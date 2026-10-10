import { describe, expect, it, vi } from "vitest";
import type { FlareMiddleware, MiddlewareContext } from "../../../src/middleware/index.ts";
import { runMiddlewares } from "../../../src/middleware/index.ts";

function createCtx(overrides?: Partial<MiddlewareContext>): MiddlewareContext {
	const handlers: Array<(response: Response) => Response | Promise<Response>> = [];
	return {
		bypass: (response: Response) => Object.freeze({ response, type: "bypass" as const }),
		env: {},
		error: () => {},
		log: () => {},
		next: () => Promise.resolve(Object.freeze({ type: "next" as const })),
		nonce: "test-nonce",
		onResponse: (handler) => {
			handlers.push(handler);
		},
		request: new Request("http://localhost/test"),
		requestType: "page" as const,
		respond: (response: Response) => Object.freeze({ response, type: "respond" as const }),
		serverContext: {},
		url: new URL("http://localhost/test"),
		warn: () => {},
		...overrides,
	};
}

describe("runMiddlewares (empty)", () => {
	it('empty array → { type: "next" }, responseHandlers = []', async () => {
		const ctx = createCtx();
		const output = await runMiddlewares([], ctx);
		expect(output.result.type).toBe("next");
		expect(output.responseHandlers).toEqual([]);
	});
});

describe("runMiddlewares (single middleware)", () => {
	it('middleware calls next() → { type: "next" }', async () => {
		const ctx = createCtx();
		const mw: FlareMiddleware = async (ctx) => ctx.next();
		const output = await runMiddlewares([mw], ctx);
		expect(output.result.type).toBe("next");
	});

	it('middleware returns ctx.respond → { type: "respond" }', async () => {
		const res = new Response("short-circuit");
		const mw: FlareMiddleware = async (ctx) => ctx.respond(res);
		const output = await runMiddlewares([mw], createCtx());
		expect(output.result.type).toBe("respond");
		expect(output.result).toHaveProperty("response", res);
	});

	it('middleware returns ctx.bypass → { type: "bypass" }', async () => {
		const res = new Response("bypass");
		const mw: FlareMiddleware = async (ctx) => ctx.bypass(res);
		const output = await runMiddlewares([mw], createCtx());
		expect(output.result.type).toBe("bypass");
		expect(output.result).toHaveProperty("response", res);
	});
});

describe("runMiddlewares (chain order)", () => {
	it("three middlewares execute in array order", async () => {
		const order: number[] = [];
		const mw0: FlareMiddleware = async (ctx) => {
			order.push(0);
			return ctx.next();
		};
		const mw1: FlareMiddleware = async (ctx) => {
			order.push(1);
			return ctx.next();
		};
		const mw2: FlareMiddleware = async (ctx) => {
			order.push(2);
			return ctx.next();
		};
		await runMiddlewares([mw0, mw1, mw2], createCtx());
		expect(order).toEqual([0, 1, 2]);
	});

	it("each middleware receives same ctx object", async () => {
		const refs: MiddlewareContext[] = [];
		const mw: FlareMiddleware = async (ctx) => {
			refs.push(ctx);
			return ctx.next();
		};
		const ctx = createCtx();
		await runMiddlewares([mw, mw, mw], ctx);
		expect(refs[0]).toBe(ctx);
		expect(refs[1]).toBe(ctx);
		expect(refs[2]).toBe(ctx);
	});

	it('innermost next() returns { type: "next" }', async () => {
		let innerResult: unknown;
		const mw: FlareMiddleware = async (ctx) => {
			innerResult = await ctx.next();
			return ctx.next();
		};
		await runMiddlewares([mw], createCtx());
		expect(innerResult).toEqual({ type: "next" });
	});
});

describe("runMiddlewares (short-circuit with respond)", () => {
	it("[0] returns respond → [1] and [2] never called", async () => {
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		const mw0: FlareMiddleware = async (ctx) => ctx.respond(new Response("stop"));
		const mw1: FlareMiddleware = async (ctx) => {
			fn1();
			return ctx.next();
		};
		const mw2: FlareMiddleware = async (ctx) => {
			fn2();
			return ctx.next();
		};
		const output = await runMiddlewares([mw0, mw1, mw2], createCtx());
		expect(output.result.type).toBe("respond");
		expect(fn1).not.toHaveBeenCalled();
		expect(fn2).not.toHaveBeenCalled();
	});
});

describe("runMiddlewares (short-circuit with bypass)", () => {
	it("[0] returns bypass → [1] and [2] never called", async () => {
		const fn1 = vi.fn();
		const mw0: FlareMiddleware = async (ctx) => ctx.bypass(new Response("raw"));
		const mw1: FlareMiddleware = async (ctx) => {
			fn1();
			return ctx.next();
		};
		const output = await runMiddlewares([mw0, mw1], createCtx());
		expect(output.result.type).toBe("bypass");
		expect(fn1).not.toHaveBeenCalled();
	});
});

describe("runMiddlewares (mid-chain short-circuit)", () => {
	it("[0] calls next(), [1] returns respond → [2] never called", async () => {
		const fn2 = vi.fn();
		const mw0: FlareMiddleware = async (ctx) => ctx.next();
		const mw1: FlareMiddleware = async (ctx) => ctx.respond(new Response("stop"));
		const mw2: FlareMiddleware = async (ctx) => {
			fn2();
			return ctx.next();
		};
		const output = await runMiddlewares([mw0, mw1, mw2], createCtx());
		expect(output.result.type).toBe("respond");
		expect(fn2).not.toHaveBeenCalled();
	});

	it("[0] calls next(), [1] returns bypass → [2] never called", async () => {
		const fn2 = vi.fn();
		const mw0: FlareMiddleware = async (ctx) => ctx.next();
		const mw1: FlareMiddleware = async (ctx) => ctx.bypass(new Response("raw"));
		const mw2: FlareMiddleware = async (ctx) => {
			fn2();
			return ctx.next();
		};
		const output = await runMiddlewares([mw0, mw1, mw2], createCtx());
		expect(output.result.type).toBe("bypass");
		expect(fn2).not.toHaveBeenCalled();
	});
});

describe("runMiddlewares (onResponse collection)", () => {
	it("middleware registers handler → handler in responseHandlers", async () => {
		const handler = vi.fn((res: Response) => res);
		const mw: FlareMiddleware = async (ctx) => {
			ctx.onResponse(handler);
			return ctx.next();
		};
		const output = await runMiddlewares([mw], createCtx());
		expect(output.responseHandlers).toHaveLength(1);
		expect(output.responseHandlers[0]).toBe(handler);
	});

	it("multiple middlewares register handlers → registration order", async () => {
		const h1 = vi.fn((res: Response) => res);
		const h2 = vi.fn((res: Response) => res);
		const mw0: FlareMiddleware = async (ctx) => {
			ctx.onResponse(h1);
			return ctx.next();
		};
		const mw1: FlareMiddleware = async (ctx) => {
			ctx.onResponse(h2);
			return ctx.next();
		};
		const output = await runMiddlewares([mw0, mw1], createCtx());
		expect(output.responseHandlers).toEqual([h1, h2]);
	});

	it("middleware registers two handlers → both collected in order", async () => {
		const h1 = vi.fn((res: Response) => res);
		const h2 = vi.fn((res: Response) => res);
		const mw: FlareMiddleware = async (ctx) => {
			ctx.onResponse(h1);
			ctx.onResponse(h2);
			return ctx.next();
		};
		const output = await runMiddlewares([mw], createCtx());
		expect(output.responseHandlers).toEqual([h1, h2]);
	});

	it("no onResponse calls → responseHandlers = []", async () => {
		const mw: FlareMiddleware = async (ctx) => ctx.next();
		const output = await runMiddlewares([mw], createCtx());
		expect(output.responseHandlers).toEqual([]);
	});
});

describe("runMiddlewares (onResponse + respond)", () => {
	it("[0] registers handler, [1] returns respond → handler from [0] collected", async () => {
		const handler = vi.fn((res: Response) => res);
		const mw0: FlareMiddleware = async (ctx) => {
			ctx.onResponse(handler);
			return ctx.next();
		};
		const mw1: FlareMiddleware = async (ctx) => ctx.respond(new Response("stop"));
		const output = await runMiddlewares([mw0, mw1], createCtx());
		expect(output.responseHandlers).toHaveLength(1);
		expect(output.responseHandlers[0]).toBe(handler);
	});

	it("[0] registers handler + returns respond (no next()) → handler collected", async () => {
		const handler = vi.fn((res: Response) => res);
		const mw: FlareMiddleware = async (ctx) => {
			ctx.onResponse(handler);
			return ctx.respond(new Response("stop"));
		};
		const output = await runMiddlewares([mw], createCtx());
		expect(output.responseHandlers).toHaveLength(1);
	});
});

describe("runMiddlewares (onResponse + bypass)", () => {
	it("[0] registers handler, [1] returns bypass → handlers still collected", async () => {
		const handler = vi.fn((res: Response) => res);
		const mw0: FlareMiddleware = async (ctx) => {
			ctx.onResponse(handler);
			return ctx.next();
		};
		const mw1: FlareMiddleware = async (ctx) => ctx.bypass(new Response("raw"));
		const output = await runMiddlewares([mw0, mw1], createCtx());
		/* handlers collected — server handler decides to skip them for bypass */
		expect(output.responseHandlers).toHaveLength(1);
	});
});

describe("runMiddlewares (error propagation)", () => {
	it("middleware throws Error → rejects with same error", async () => {
		const mw: FlareMiddleware = async () => {
			throw new Error("middleware boom");
		};
		await expect(runMiddlewares([mw], createCtx())).rejects.toThrow("middleware boom");
	});

	it("error in [1] → [2] not called", async () => {
		const fn2 = vi.fn();
		const mw0: FlareMiddleware = async (ctx) => ctx.next();
		const mw1: FlareMiddleware = async () => {
			throw new Error("fail");
		};
		const mw2: FlareMiddleware = async (ctx) => {
			fn2();
			return ctx.next();
		};
		await expect(runMiddlewares([mw0, mw1, mw2], createCtx())).rejects.toThrow("fail");
		expect(fn2).not.toHaveBeenCalled();
	});
});

describe("ctx fields", () => {
	it("ctx.env, ctx.nonce, ctx.request, ctx.url accessible", async () => {
		let captured: MiddlewareContext | undefined;
		const mw: FlareMiddleware = async (ctx) => {
			captured = ctx;
			return ctx.next();
		};
		const ctx = createCtx({ env: { DB: "test" }, nonce: "abc123" });
		await runMiddlewares([mw], ctx);
		expect(captured?.env).toEqual({ DB: "test" });
		expect(captured?.nonce).toBe("abc123");
		expect(captured?.request).toBeInstanceOf(Request);
		expect(captured?.url).toBeInstanceOf(URL);
	});
});

/* ── Double next() guard ──────────────────────────────────────────── */

describe("runMiddlewares (double next guard)", () => {
	it("calling next() twice does not re-execute subsequent middleware", async () => {
		const callCount = vi.fn();
		const mw0: FlareMiddleware = async (ctx) => {
			const r1 = await ctx.next();
			await ctx.next();
			return r1;
		};
		const mw1: FlareMiddleware = async (ctx) => {
			callCount();
			return ctx.next();
		};
		await runMiddlewares([mw0, mw1], createCtx());
		expect(callCount).toHaveBeenCalledTimes(1);
	});

	it("second next() returns same result as first", async () => {
		let firstResult: unknown;
		let secondResult: unknown;
		const mw: FlareMiddleware = async (ctx) => {
			firstResult = await ctx.next();
			secondResult = await ctx.next();
			return ctx.next();
		};
		await runMiddlewares([mw], createCtx());
		expect(firstResult).toEqual(secondResult);
	});

	it("double next() does not duplicate responseHandlers", async () => {
		const handler = vi.fn((res: Response) => res);
		const mw0: FlareMiddleware = async (ctx) => {
			await ctx.next();
			await ctx.next();
			return ctx.next();
		};
		const mw1: FlareMiddleware = async (ctx) => {
			ctx.onResponse(handler);
			return ctx.next();
		};
		const output = await runMiddlewares([mw0, mw1], createCtx());
		expect(output.responseHandlers).toHaveLength(1);
	});
});

/* ── Sparse/undefined middleware guard ─────────────────────────────── */

describe("runMiddlewares - undefined middleware in array", () => {
	it("undefined entry in array → skipped, returns next", async () => {
		const ctx = createCtx();
		const middlewares = [undefined] as unknown as FlareMiddleware[];
		const output = await runMiddlewares(middlewares, ctx);
		expect(output.result.type).toBe("next");
	});

	it("undefined between valid middlewares → chain stops at undefined, subsequent skipped", async () => {
		const order: number[] = [];
		const mw1: FlareMiddleware = async (ctx) => {
			order.push(1);
			return ctx.next();
		};
		const mw2: FlareMiddleware = async (ctx) => {
			order.push(2);
			return ctx.next();
		};
		/* undefined at index 1 returns middlewareNext(), mw2 at index 2 never reached */
		const middlewares = [mw1, undefined, mw2] as unknown as FlareMiddleware[];
		const ctx = createCtx();
		const output = await runMiddlewares(middlewares, ctx);
		expect(order).toEqual([1]);
		expect(output.result.type).toBe("next");
	});
});
