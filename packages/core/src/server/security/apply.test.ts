import { expect, it } from "vitest";
import { serveWith } from "../lifecycle/create.ts";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter } from "../../shared/router/create-router.ts";
import { applySecurity, mergeHeaders } from "./apply.ts";

const url = "https://example.com/";

it("overwrites", () => {
	const result = applySecurity({
		url,
		headers: new Headers({ "content-security-policy": "stored" }),
	});
	const policy = result.headers.get("content-security-policy") ?? "";
	expect(policy).toContain(`'nonce-${result.nonce}'`);
	expect(policy).not.toContain("stored");
});

it("route security", () => {
	const result = applySecurity({
		url,
		headers: new Headers(),
		route: { "X-Frame-Options": "SAMEORIGIN" },
	});
	expect(result.headers.get("x-frame-options")).toBe("SAMEORIGIN");
});

// The callback runs with the request's context and its nonce, the one the header carries. Without a context, as
// before serverContext, it does not run and the defaults hold (BUGS.md 112).
it("callback override", () => {
	const seen: string[] = [];
	const security = (ctx: { nonce: string }) => {
		seen.push(ctx.nonce);
		return { "X-Frame-Options": "SAMEORIGIN" } as const;
	};
	const context = { request: new Request(url), env: undefined, serverContext: {} };
	const result = applySecurity({ url, headers: new Headers(), security, context });
	expect(result.headers.get("x-frame-options")).toBe("SAMEORIGIN");
	expect(seen).toEqual([result.nonce]);
	expect(applySecurity({ url, headers: new Headers(), security }).headers.get("x-frame-options")).toBe("DENY");
	expect(seen).toHaveLength(1);
});

// Every key dx/server.md lists: a string sets the header, `false` removes it, and the two absent by default appear
// only when set. A route key replaces the server's, and the nonce candidate is kept (BUGS.md 112).
it("every key", () => {
	const strings = {
		"Strict-Transport-Security": "max-age=1",
		"X-Content-Type-Options": "nosniff",
		"Referrer-Policy": "no-referrer",
		"X-Frame-Options": "SAMEORIGIN",
		"Cross-Origin-Opener-Policy": "same-origin-allow-popups",
		"Cross-Origin-Resource-Policy": "same-site",
		"Permissions-Policy": "camera=()",
		"X-Powered-By": "flare",
		"Content-Security-Policy": "default-src 'none'",
	} as const;
	const set = applySecurity({ url, headers: new Headers(), security: strings });
	for (const [name, value] of Object.entries(strings)) expect(set.headers.get(name)).toBe(value);
	const removed = applySecurity({
		url,
		headers: new Headers(),
		security: strings,
		route: Object.fromEntries(Object.keys(strings).map((name) => [name, false])),
	});
	expect([...removed.headers.keys()]).toEqual([]);
	const plain = applySecurity({ url, headers: new Headers() });
	expect(plain.headers.has("cross-origin-resource-policy")).toBe(false);
	expect(plain.headers.has("x-powered-by")).toBe(false);
	const kept = applySecurity({
		url,
		headers: new Headers(),
		candidate: plain.candidate,
		route: { "Referrer-Policy": "same-origin" },
	});
	expect(kept.nonce).toBe(plain.nonce);
});

it("false removes", () => {
	const result = applySecurity({
		url,
		headers: new Headers(),
		route: { "X-Frame-Options": false },
	});
	expect(result.headers.has("x-frame-options")).toBe(false);
});

it("headers() cannot", () => {
	const result = applySecurity({
		url,
		headers: new Headers(),
		routeHeaders: { "Content-Security-Policy": "from-headers" },
		security: { "Content-Security-Policy": "from-security" },
	});
	expect(result.headers.get("content-security-policy")).toBe("from-security");
});

it("both cookies", () => {
	const merged = mergeHeaders(
		{ "set-cookie": "a", "x-other": "parent", "x-keep": "stay" },
		{ "set-cookie": "b", "x-other": "child", "x-keep": undefined },
	);
	expect(merged["set-cookie"]).toEqual(["a", "b"]);
	expect(merged["x-other"]).toBe("child");
	expect(merged["x-keep"]).toBe("stay");
	expect(mergeHeaders({ "set-cookie": "a" }, { "set-cookie": undefined })["set-cookie"]).toBe("a");
	expect(mergeHeaders({ "x-other": "parent" }, { "set-cookie": "b" })["set-cookie"]).toBe("b");
});

// Dev adds what Vite's client needs, such as its ping worker's blob: URL. Production keeps worker-src 'self'.
it("dev policy", () => {
	const worker = (dev?: boolean): string | undefined => {
		const result = applySecurity({ url, headers: new Headers(), ...(dev !== undefined && { dev }) });
		return /worker-src ([^;]*)/.exec(result.headers.get("content-security-policy") ?? "")?.[1];
	};
	expect(worker(true)).toBe("'self' blob:");
	expect(worker(false)).toBe("'self'");
	expect(worker()).toBe("'self'");
});

// Through createServer: the callback gets the request, the env, its nonce, and serverContext's value, and a route's
// directives object and Permissions-Policy reach the document; a 400 before serverContext carries the defaults and does
// not call it (BUGS.md 112).
it("server security", async () => {
	const seen: unknown[] = [];
	const page = createPage("_root_/")
		.security({ "Permissions-Policy": { camera: "self" } })
		.render(() => "home");
	const root = createRootLayout("_root_").render((props) => props.children);
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/", path: "/", module: page }] });
	const server = serveWith(
		{
			router,
			serverContext: () => ({ region: "eu" }),
			security: (ctx) => {
				seen.push(ctx.serverContext, ctx.env, new URL(ctx.request.url).pathname, ctx.nonce);
				return {
					"Content-Security-Policy": { "frame-ancestors": ["'self'"] },
					"Strict-Transport-Security": "max-age=1",
					"X-Powered-By": "flare",
				};
			},
		},
		{ dev: false, log: { level: "error", error: noop, warn: noop, log: noop } },
	);
	const response = await server.fetch(new Request(url), { name: "env" });
	const csp = response.headers.get("content-security-policy") ?? "";
	expect(csp).toContain("frame-ancestors 'self'");
	expect(response.headers.get("permissions-policy")).toContain("camera=(self)");
	expect(response.headers.get("strict-transport-security")).toBe("max-age=1");
	expect(response.headers.get("x-powered-by")).toBe("flare");
	expect(seen.slice(0, 3)).toEqual([{ region: "eu" }, { name: "env" }, "/"]);
	expect(csp).toContain(`'nonce-${String(seen[3])}'`);
	expect((await server.fetch(new Request("https://example.com/unknown"))).status).toBe(404);
	const hostile = await server.fetch(new Request("https://example.com//x"));
	expect(hostile.status).toBe(400);
	expect(hostile.headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains");
	expect(hostile.headers.has("x-powered-by")).toBe(false);
	expect(seen).toHaveLength(8);
});

// A throwing callback is a bug: a projected 500, as any other stage's throw (BUGS.md 112).
it("callback throws", async () => {
	const logged: string[] = [];
	const root = createRootLayout("_root_").render((props) => props.children);
	const router = createRouter({ layouts: { _root_: root }, routeTree: [] });
	const log = { level: "error" as const, error: (tag: string) => void logged.push(tag), warn: noop, log: noop };
	const response = await serveWith({ router, security: brokenPolicy }, { dev: false, log }).fetch(new Request(url));
	expect(response.status).toBe(500);
	expect(logged).toEqual(["render"]);
});

function noop(): void {}

function brokenPolicy(): never {
	throw new Error("policy bug");
}
