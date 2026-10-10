/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import { apiProxy } from "../../../src/middleware/builtins/api-proxy.ts";

/**
 * Bug 70: apiProxy missing duplex: "half" for streaming request bodies
 *
 * When proxying POST/PUT requests with streaming bodies, new Request()
 * requires duplex: "half" per the Fetch spec. Without it, Workers throws:
 * "TypeError: RequestInit: duplex option is required when sending a body."
 *
 * mount/index.ts already handles this correctly (line 106).
 */

function makeCtx(method: string, pathname: string, body?: BodyInit | null) {
	const url = new URL(`http://localhost${pathname}`);
	const request = new Request(url, {
		body,
		duplex: body ? "half" : undefined,
		method,
	} as RequestInit);
	return {
		bypass: (r: Response) => ({ response: r, type: "bypass" as const }),
		env: {},
		next: async () => ({ type: "next" as const }),
		request,
		respond: (r: Response) => ({ response: r, type: "respond" as const }),
		url,
	};
}

describe("Bug 70: apiProxy duplex for streaming bodies", () => {
	it("should forward POST requests with streaming bodies without throwing", async () => {
		const mockService = {
			fetch: vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
		};

		const middleware = apiProxy({
			pathPrefix: "/api",
			target: () => mockService,
		});

		/* Create a request with a ReadableStream body */
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('{"data":"test"}'));
				controller.close();
			},
		});

		const ctx = makeCtx("POST", "/api/users", stream);

		/* This should NOT throw about missing duplex option */
		const result = await middleware(ctx as never);
		expect(result).toBeDefined();
		expect(mockService.fetch).toHaveBeenCalledTimes(1);

		/* Verify the proxied request was created with the body intact */
		const proxiedRequest = mockService.fetch.mock.calls[0][0] as Request;
		expect(proxiedRequest.method).toBe("POST");
		expect(proxiedRequest.body).not.toBeNull();
	});

	it("should handle GET requests without body (no duplex needed)", async () => {
		const mockService = {
			fetch: vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
		};

		const middleware = apiProxy({
			pathPrefix: "/api",
			target: () => mockService,
		});

		const ctx = makeCtx("GET", "/api/data");

		const result = await middleware(ctx as never);
		expect(result).toBeDefined();
		expect(mockService.fetch).toHaveBeenCalledTimes(1);
	});
});
