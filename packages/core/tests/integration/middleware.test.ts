import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createServer } from "../../src/server/lifecycle/create.ts";
import { createMiddleware, type MiddlewareEntry } from "../../src/server/middleware/index.ts";
import { mount } from "../../src/server/mount/index.ts";
import { proxy } from "../../src/server/proxy/index.ts";
import { createPage } from "../../src/shared/route-builder/page.ts";
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts";
import { createRouter } from "../../src/shared/router/create-router.ts";

const router = createRouter({
	layouts: { _root_: createRootLayout("_root_").render((props) => props.children) },
	routeTree: [{ id: "_root_/about", path: "/about", module: createPage("_root_/about").render(() => "about") }],
});

// A real upstream on a local socket. proxy accepts only https, so `https://upstream.test` maps to it here.
let upstream: Server;
let port = 0;
const seen: Array<{ url: string; headers: Record<string, string | string[] | undefined>; body: Buffer }> = [];

beforeAll(async () => {
	upstream = createHttpServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => chunks.push(chunk));
		req.on("end", () => {
			const body = Buffer.concat(chunks);
			seen.push({ url: req.url ?? "", headers: req.headers, body });
			res.writeHead(200, { connection: "close", "x-up": "1", "content-type": "application/octet-stream" });
			res.end(body);
		});
	});
	await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
	port = (upstream.address() as AddressInfo).port;
	const real = globalThis.fetch.bind(globalThis);
	vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		if (url.origin !== "https://upstream.test") return real(input, init);
		return real(`http://127.0.0.1:${port}${url.pathname}${url.search}`, init);
	});
});

afterAll(async () => {
	vi.restoreAllMocks();
	await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

it("filter", async () => {
	const entered: string[] = [];
	const watch = createMiddleware((ctx) => void entered.push(ctx.path));
	const calls: string[] = [];
	const fns = createMiddleware((ctx) => void calls.push(`${ctx.kind} ${ctx.path}`));
	const middleware: MiddlewareEntry[] = [
		{ filter: { prefix: ["/admin"] }, handler: watch },
		{ filter: { kind: ["serverFn"] }, handler: fns },
	];
	const server = createServer({ router, middleware });
	expect((await server.fetch(new Request("http://localhost/about"))).status).toBe(200);
	await server.fetch(new Request("http://localhost/admin/x"));
	expect(entered).toEqual(["/admin/x"]);
	// A server-function call enters a `kind` filter and still reaches dispatch, which knows no such id.
	const fn = await server.fetch(new Request("http://localhost/_flare/fn/abc", { method: "POST", body: "null" }));
	expect(fn.status).toBe(404);
	expect(calls).toEqual(["serverFn /_flare/fn/abc"]);
});

it("mount and page", async () => {
	const server = createServer({ router, mounts: [mount("/api", () => new Response("api"))] });
	const page = await server.fetch(new Request("http://localhost/about"));
	const api = await server.fetch(new Request("http://localhost/api/x"));
	expect(await page.text()).toContain("about");
	expect(await api.text()).toBe("api");
	for (const response of [page, api]) expect(response.headers.get("x-content-type-options")).toBe("nosniff");
});

it("proxy", async () => {
	const forward = mount("/api", (request) => proxy(request, "https://upstream.test"));
	const server = createServer({ router, mounts: [forward] });
	const bytes = new Uint8Array([0xff, 0x00, 0xc3, 0x28]);
	const response = await server.fetch(
		new Request("http://localhost/api/echo?q=1", {
			method: "POST",
			body: bytes,
			headers: { "keep-alive": "timeout=5" },
		}),
	);
	expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
	expect(seen.at(-1)?.url).toBe("/echo?q=1");
	expect(seen.at(-1)?.headers["keep-alive"]).toBeUndefined();
	expect(response.headers.get("connection")).toBeNull();
	expect(response.headers.get("x-up")).toBe("1");
	expect(response.headers.get("x-content-type-options")).toBe("nosniff");
});
