import { expect, it } from "vitest";
import { createServer } from "../../src/server/lifecycle/create.ts";
import { createServerFn } from "../../src/server/server-fn/dispatch.ts";
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts";
import { createRouter } from "../../src/shared/router/create-router.ts";

// `__id` and `__name` are what the boundary transform writes into the config. They are not typed config.
const config = { method: "post" as const, __id: "echo0123456789ab", __name: "echo" };

const echo = createServerFn(config)
	.input((value: unknown) => value)
	.handler(({ input }) => input);

const server = createServer({
	router: createRouter({ layouts: { _root_: createRootLayout("_root_").render(() => null) }, routeTree: [] }),
	serverFns: { [echo.id]: async () => echo },
});

function post(body: unknown, origin = "http://localhost"): Request {
	return new Request(`http://localhost/_flare/fn/${echo.id}`, {
		method: "POST",
		body: JSON.stringify(body),
		headers: { origin, "content-type": "application/json" },
	});
}

it("round trip", async () => {
	const response = await server.fetch(post({ text: "hi" }));
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ name: "echo", status: 200, data: { text: "hi" } });
});

it("csrf", async () => {
	const response = await server.fetch(post({ text: "hi" }, "https://evil.example"));
	expect(response.status).toBe(403);
});

it("no store", async () => {
	const response = await server.fetch(post({ text: "hi" }));
	expect(response.status).toBe(200);
	expect(response.headers.get("cache-control")).toBe("private, no-store");
});
