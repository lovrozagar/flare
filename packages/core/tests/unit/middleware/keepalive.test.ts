import { describe, expect, it, vi } from "vitest";
import type { FlareMiddleware, MiddlewareContext } from "../../../src/middleware/index.ts";
import { runMiddlewares } from "../../../src/middleware/index.ts";
import { keepalive } from "../../../src/middleware/builtins/keepalive.ts";

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

describe("keepalive middleware", () => {
	it("returns bypass 204 on GET /_flare/keepalive", async () => {
		const mw = keepalive();
		const ctx = createCtx({
			request: new Request("http://localhost/_flare/keepalive"),
			url: new URL("http://localhost/_flare/keepalive"),
		});

		const output = await runMiddlewares([mw], ctx);
		expect(output.result.type).toBe("bypass");
		expect(output.result).toHaveProperty("response");
		const response = (output.result as { response: Response }).response;
		expect(response.status).toBe(204);
	});

	it("calls next() on non-ping paths", async () => {
		const mw = keepalive();
		const ctx = createCtx({
			request: new Request("http://localhost/about"),
			url: new URL("http://localhost/about"),
		});

		const output = await runMiddlewares([mw], ctx);
		expect(output.result.type).toBe("next");
	});

	it("calls next() on POST to /_flare/keepalive", async () => {
		const mw = keepalive();
		const ctx = createCtx({
			request: new Request("http://localhost/_flare/keepalive", { method: "POST" }),
			url: new URL("http://localhost/_flare/keepalive"),
		});

		const output = await runMiddlewares([mw], ctx);
		expect(output.result.type).toBe("next");
	});

	it("awaits handler before returning 204", async () => {
		const order: string[] = [];
		const handler = async () => {
			await new Promise((r) => setTimeout(r, 10));
			order.push("handler");
		};

		const mw = keepalive({ handler });
		const ctx = createCtx({
			request: new Request("http://localhost/_flare/keepalive"),
			url: new URL("http://localhost/_flare/keepalive"),
		});

		const output = await runMiddlewares([mw], ctx);
		order.push("done");

		expect(order).toEqual(["handler", "done"]);
		expect(output.result.type).toBe("bypass");
		const response = (output.result as { response: Response }).response;
		expect(response.status).toBe(204);
	});

	it("returns 204 even if handler throws (logs error)", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const handler = async () => {
			throw new Error("handler boom");
		};

		const mw = keepalive({ handler });
		const ctx = createCtx({
			request: new Request("http://localhost/_flare/keepalive"),
			url: new URL("http://localhost/_flare/keepalive"),
		});

		const output = await runMiddlewares([mw], ctx);
		expect(output.result.type).toBe("bypass");
		const response = (output.result as { response: Response }).response;
		expect(response.status).toBe(204);
		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});

	it("handler receives middleware context", async () => {
		let receivedCtx: MiddlewareContext | undefined;
		const handler = async (handlerCtx: MiddlewareContext) => {
			receivedCtx = handlerCtx;
		};

		const mw = keepalive({ handler });
		const ctx = createCtx({
			env: { DB: "test" },
			request: new Request("http://localhost/_flare/keepalive"),
			url: new URL("http://localhost/_flare/keepalive"),
		});

		await runMiddlewares([mw], ctx);
		expect(receivedCtx).toBeDefined();
		expect(receivedCtx?.env).toEqual({ DB: "test" });
	});

	it("downstream middleware not called on ping match", async () => {
		const downstream = vi.fn();
		const mw = keepalive();
		const mw2: FlareMiddleware = async (ctx) => {
			downstream();
			return ctx.next();
		};

		const ctx = createCtx({
			request: new Request("http://localhost/_flare/keepalive"),
			url: new URL("http://localhost/_flare/keepalive"),
		});

		await runMiddlewares([mw, mw2], ctx);
		expect(downstream).not.toHaveBeenCalled();
	});
});
