import http from "node:http";
import { createComponent, createMemo, Loading, onCleanup } from "solid-js";
import type { JSX } from "@solidjs/web";
import { expect, it, vi } from "vitest";
import { createNodeListener } from "../../src/adapters/node/listener.ts";
import type { DevErrorPayload } from "../../src/shared/errors/dev-report.ts";
import { createPage } from "../../src/shared/route-builder/page.ts";
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts";
import { createRouter } from "../../src/shared/router/create-router.ts";
import { serveWith } from "../../src/server/lifecycle/create.ts";
import type { Logger } from "../../src/server/lifecycle/logger.ts";
import type { ErrorSink } from "../../src/server/render/projector.ts";

const FRAME = /(\n|\\n)\s+at /;

function noop(): void {}

const quiet: Logger = { level: "error", error: noop, warn: noop, log: noop };

// A page whose slot never settles, and whose cleanup records that the render was disposed.
function pendingApp(sink: ErrorSink): { app: ReturnType<typeof serveWith>; disposed: PromiseWithResolvers<void> } {
	const disposed = Promise.withResolvers<void>();
	const never = new Promise<string>(noop);
	const page = createPage("_root_").render((): JSX.Element => {
		onCleanup(() => disposed.resolve());
		return createComponent(Loading, {
			fallback: "waiting",
			get children() {
				const value = createMemo(async () => never);
				return [() => value()];
			},
		});
	});
	const root = createRootLayout("_root_").render((props) => props.children);
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_", path: "/", module: page }] });
	return { app: serveWith({ router }, sink), disposed };
}

function throwingApp(sink: ErrorSink): ReturnType<typeof serveWith> {
	const root = createRootLayout("_root_").render((): never => {
		throw new Error("root broke");
	});
	const page = createPage("_root_").render(() => "page");
	return serveWith(
		{ router: createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_", path: "/", module: page }] }) },
		sink,
	);
}

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
	return Promise.race([
		promise,
		new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error(`not within ${ms}ms`)), ms)),
	]);
}

it("abort closes", async () => {
	const { app, disposed } = pendingApp({ dev: false, log: quiet });
	const listener = createNodeListener(app);
	const closed = Promise.withResolvers<void>();
	const server = http.createServer((req, res) => {
		req.socket.once("close", () => closed.resolve());
		listener(
			{ method: req.method ?? "GET", url: req.url ?? "/", headers: {} },
			{
				writeHead: (status) => res.writeHead(status),
				setHeader: (name, value) => res.setHeader(name, value),
				write: (chunk) => res.write(chunk),
				end: () => res.end(),
				once: (event, callback) => res.once(event, callback),
				get writableFinished() {
					return res.writableFinished;
				},
			},
		);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("port");
	const client = http.get({ host: "127.0.0.1", port: address.port, path: "/" }, (response) => {
		response.once("data", () => client.destroy());
	});
	client.on("error", noop);
	await expect(within(closed.promise, 1000)).resolves.toBeUndefined();
	await expect(within(disposed.promise, 1000)).resolves.toBeUndefined();
	server.close();
});

it("throw before shell", async () => {
	const send = vi.fn<(payload: DevErrorPayload) => void>();
	const response = await throwingApp({ dev: false, send, log: quiet }).fetch(new Request("http://localhost/"));
	expect(response.status).toBe(500);
	expect((await response.arrayBuffer()).byteLength).toBe(0);
	expect(send).not.toHaveBeenCalled();
});

it("dev before shell", async () => {
	const send = vi.fn<(payload: DevErrorPayload) => void>();
	const response = await throwingApp({ dev: true, send, log: quiet }).fetch(new Request("http://localhost/"));
	expect(response.status).toBe(500);
	const body = await response.text();
	expect(body).toContain("root broke");
	expect(body).toMatch(FRAME);
	expect(send).toHaveBeenCalledExactlyOnceWith({
		type: "error",
		err: { message: "root broke", stack: expect.stringMatching(FRAME) },
	});
});

it("cancel disposes", async () => {
	const { app, disposed } = pendingApp({ dev: false, log: quiet });
	const response = await app.fetch(new Request("http://localhost/"));
	expect(response.status).toBe(200);
	const reader = response.body?.getReader();
	if (reader === undefined) throw new Error("no body");
	expect(new TextDecoder().decode((await reader.read()).value)).toContain("waiting");
	await reader.cancel();
	await expect(within(disposed.promise, 1000)).resolves.toBeUndefined();
});
