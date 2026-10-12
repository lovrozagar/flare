import { getRequestEvent } from "@solidjs/web";
import { expect, it } from "vitest";
import type { FlareRegister } from "../../shared/route-builder/register.ts";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter, type Router } from "../../shared/router/create-router.ts";
import { createServer } from "../lifecycle/create.ts";
import { serverCtx, withServerContext } from "./ctx.ts";

type ContextApp = FlareRegister & { serverContext: { requestId: string } };

const request = new Request("http://localhost/");
function routerWith(loader: () => string): Router {
	return createRouter({
		layouts: { _root_: createRootLayout("_root_").render(() => "") },
		routeTree: [
			{
				id: "_root_",
				path: "/",
				module: createPage("_root_")
					.loader(loader)
					.render(() => ""),
			},
		],
	});
}

const router = routerWith(() => "Home");

function unreachable(): never {
	throw new Error("serverContext did not throw");
}

it("returns the value", async () => {
	const value = { user: "ada" };
	const seen = await withServerContext(
		{ request, env: {}, serverContext: () => value },
		async () => {
			await Promise.resolve();
			return serverCtx();
		},
		unreachable,
	);
	expect(seen).toBe(value);
});

it("not the event", async () => {
	const seen = await withServerContext(
		{ request, env: {}, serverContext: () => ({}) },
		async () => {
			const event = getRequestEvent();
			if (event === undefined) throw new Error("no request event");
			Object.assign(event.locals, { user: "ada" });
			return serverCtx();
		},
		unreachable,
	);
	expect(seen).toEqual({});
});

it("redirect skips", async () => {
	const calls: string[] = [];
	const server = createServer({
		router,
		serverContext: ({ request: seen }) => {
			calls.push(new URL(seen.url).pathname);
			return {};
		},
	});
	const moved = await server.fetch(new Request("http://localhost/About"));
	expect(moved.status).toBe(301);
	expect(moved.headers.get("location")).toBe("/about");
	const hostile = await server.fetch(new Request("http://localhost/a%2fb"));
	expect(hostile.status).toBe(400);
	expect(calls).toEqual([]);
	await server.fetch(new Request("http://localhost/"));
	expect(calls).toEqual(["/"]);
});

it("required", () => {
	// @ts-expect-error FlareRegister declares serverContext, so the option is required
	const missing = createServer<ContextApp>({ router });
	const given = createServer<ContextApp>({ router, serverContext: () => ({ requestId: "r1" }) });
	expect(typeof missing.fetch).toBe("function");
	expect(typeof given.fetch).toBe("function");
});

it("throw is 500", async () => {
	let loaded = false;
	const server = createServer({
		router: routerWith(() => {
			loaded = true;
			return "Home";
		}),
		serverContext: () => {
			throw new Error("ctx boom");
		},
	});
	const response = await server.fetch(new Request("http://localhost/"));
	expect(response.status).toBe(500);
	expect(await response.text()).not.toContain("ctx boom");
	expect(loaded).toBe(false);
});

it("outside a request", () => {
	expect(() => serverCtx()).toThrow("serverCtx");
});
