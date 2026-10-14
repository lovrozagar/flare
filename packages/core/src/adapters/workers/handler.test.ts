import { expect, it } from "vitest";
import { createServer } from "../../server/lifecycle/create.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter } from "../../shared/router/create-router.ts";
import { createWorkersHandler, type WorkerCtx, type WorkerEnv } from "./handler.ts";

const ctx = (): WorkerCtx => ({
	waitUntil() {},
});

it("waitUntil", async () => {
	const task = Promise.resolve("background");
	const received: Promise<unknown>[] = [];
	const handler = createWorkersHandler({
		fetch(_request, _env, context) {
			context.waitUntil(task);
			return new Response("ok");
		},
	});
	const response = await handler.fetch(
		new Request("https://example.com/"),
		{},
		{
			waitUntil(promise) {
				received.push(promise);
			},
		},
	);
	expect(response.status).toBe(200);
	expect(received).toEqual([task]);
});

it("assets GET", async () => {
	const seen: string[] = [];
	let routed = 0;
	const env: WorkerEnv = {
		ASSETS: {
			fetch(request) {
				seen.push(`${request.method} ${new URL(request.url).pathname}`);
				return new Response("file");
			},
		},
	};
	const handler = createWorkersHandler(
		{
			fetch() {
				routed += 1;
				return new Response("missing", { status: 404 });
			},
		},
		{ assets: "ASSETS" },
	);
	const get = await handler.fetch(new Request("https://example.com/app.js"), env, ctx());
	const head = await handler.fetch(new Request("https://example.com/app.js", { method: "HEAD" }), env, ctx());
	expect(routed).toBe(2);
	expect(seen).toEqual(["GET /app.js", "HEAD /app.js"]);
	expect(get.status).toBe(200);
	expect(await get.text()).toBe("file");
	expect(head.status).toBe(200);
});

it("assets POST", async () => {
	let called = 0;
	const handler = createWorkersHandler({ fetch: () => new Response("missing", { status: 404 }) }, { assets: "ASSETS" });
	const response = await handler.fetch(
		new Request("https://example.com/app.js", { method: "POST" }),
		{
			ASSETS: {
				fetch() {
					called += 1;
					return new Response("file");
				},
			},
		},
		ctx(),
	);
	expect(response.status).toBe(405);
	expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
	expect(called).toBe(0);
});

// The server's ingress computes the canonical path (B22): a non-canonical one is its 301 or 400, as on Node and Bun,
// and never reaches the binding. A 404 passed that ingress, so the binding gets the request as it came.
it("assets escape", async () => {
	const forwarded: Request[] = [];
	const root = createRootLayout("_root_").render((props) => props.children);
	const server = createServer({ router: createRouter({ layouts: { _root_: root }, routeTree: [] }) });
	const handler = createWorkersHandler(server, { assets: "ASSETS" });
	const env: WorkerEnv = { ASSETS: { fetch: (request) => (forwarded.push(request), new Response("file")) } };
	const empty = await handler.fetch(new Request("https://example.com/a//b"), env, ctx());
	expect([empty.status, empty.headers.get("location")]).toEqual([301, "/a/b"]);
	expect((await handler.fetch(new Request("https://example.com/%2f"), env, ctx())).status).toBe(400);
	expect(forwarded).toEqual([]);
	const canonical = new Request("https://example.com/a/b");
	expect(await (await handler.fetch(canonical, env, ctx())).text()).toBe("file");
	expect(forwarded).toEqual([canonical]);
	expect(forwarded[0]).toBe(canonical);
});

it("assets missing", async () => {
	const logged: unknown[][] = [];
	const error = console.error;
	console.error = (...args: unknown[]) => {
		logged.push(args);
	};
	try {
		const handler = createWorkersHandler(
			{ fetch: () => new Response("missing", { status: 404 }) },
			{ assets: "ASSETS" },
		);
		const response = await handler.fetch(new Request("https://example.com/app.js"), {}, ctx());
		expect(response.status).toBe(500);
		expect(logged).toHaveLength(1);
	} finally {
		console.error = error;
	}
});

it("connecting ip", async () => {
	const seen: Array<string | undefined> = [];
	const handler = createWorkersHandler({
		fetch(_request, _env, context) {
			seen.push(context.clientIp);
			return new Response("ok", { status: context.clientIp === undefined ? 404 : 200 });
		},
	});
	const present = await handler.fetch(
		new Request("https://example.com/", { headers: { "cf-connecting-ip": "1.2.3.4" } }),
		{},
		ctx(),
	);
	const absent = await handler.fetch(new Request("https://example.com/"), {}, ctx());
	expect(present.status).toBe(200);
	expect(absent.status).toBe(404);
	expect(seen).toEqual(["1.2.3.4", undefined]);
});

// The app's own not-found answer, with a security header.
function notFound(): Response {
	return new Response("<p>not found</p>", {
		status: 404,
		headers: { "x-frame-options": "DENY", "content-type": "text/html" },
	});
}

// A path neither the router nor the binding has is the app's own 404 document, with its headers, as on Node and Bun.
// A real static asset is still the binding's response, untouched.
it("assets miss", async () => {
	const env: WorkerEnv = {
		ASSETS: {
			fetch(request) {
				const path = new URL(request.url).pathname;
				return path === "/app.js"
					? new Response("file", { headers: { "x-asset": "1" } })
					: new Response(null, { status: 404 });
			},
		},
	};
	const handler = createWorkersHandler({ fetch: notFound }, { assets: "ASSETS" });
	const missing = await handler.fetch(new Request("https://example.com/nothing"), env, ctx());
	expect(missing.status).toBe(404);
	expect(missing.headers.get("x-frame-options")).toBe("DENY");
	expect(await missing.text()).toBe("<p>not found</p>");
	const head = await handler.fetch(new Request("https://example.com/nothing", { method: "HEAD" }), env, ctx());
	expect(head.status).toBe(404);
	expect(head.headers.get("content-type")).toBe("text/html");
	const asset = await handler.fetch(new Request("https://example.com/app.js"), env, ctx());
	expect(asset.status).toBe(200);
	expect(asset.headers.get("x-asset")).toBe("1");
	expect(asset.headers.has("x-frame-options")).toBe(false);
	expect(await asset.text()).toBe("file");
});
