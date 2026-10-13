import { expect, it } from "vitest";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRouter, type RouterOptions } from "../../shared/router/create-router.ts";
import { resolveTarget, resolveUrl, type TargetContext } from "./target.ts";

const pages: RouterOptions["routeTree"] = [
	{ id: "_root_/", path: "/", module: {} },
	{ id: "_root_/about", path: "/about", module: {} },
	{ id: "_root_/new", path: "/new", module: {} },
	{ id: "_root_/users/[id]", path: "/users/[id]", module: {} },
	{ id: "_root_/api", path: "/api", module: createPage("_root_/api").response(() => new Response("x")) },
	{ id: "_admin_/dashboard", path: "/dashboard", module: {} },
];

function context(options: Partial<RouterOptions> = {}): TargetContext {
	const router = createRouter({ layouts: { _root_: {}, _admin_: {} }, routeTree: pages, ...options });
	return { router, origin: "http://localhost", current: { pathname: "/", search: "", hash: "" } };
}

it("foreign origin", () => {
	expect(() => resolveTarget({ to: "https://evil/" }, context())).toThrow(/route id/);
	expect(() => resolveTarget({ to: "//evil/x" }, context())).toThrow(/route id/);
});

it("data url", () => {
	expect(resolveTarget({ to: "_root_/about" }, context())).toMatchObject({
		kind: "data",
		url: "/about",
		dataUrl: "/about?_flare=data",
		location: { pathname: "/about", search: "", hash: "" },
	});
});

it("missing param", () => {
	expect(() => resolveTarget({ to: "_root_/users/[id]" }, context())).toThrow(/id/);
});

it("strips reserved", () => {
	const target = resolveTarget({ to: "_root_/about", search: { _flare: "isr", _flare_stale: "x", q: "1" } }, context());
	expect(target).toMatchObject({ url: "/about?q=1", dataUrl: "/about?q=1&_flare=data" });
});

it("hash", () => {
	const target = resolveTarget({ to: "_root_/about", hash: "x" }, context());
	expect(target).toMatchObject({ url: "/about#x", dataUrl: "/about?_flare=data", location: { hash: "#x" } });
	const same = resolveTarget({ to: "_root_/", hash: "top" }, context());
	expect(same.kind).toBe("hash");
});

it("shallow other route", () => {
	expect(() => resolveTarget({ to: "_root_/about", shallow: true }, context())).toThrow(/shallow/);
	expect(resolveTarget({ to: "_root_/", shallow: true, search: { q: "1" } }, context()).kind).toBe("shallow");
});

it("location shape", () => {
	const seen: unknown[] = [];
	const rewritten = context({
		rewrite(location) {
			seen.push(location);
			return location.pathname === "/about" ? { ...location, pathname: "/new" } : undefined;
		},
	});
	const target = resolveTarget({ to: "_root_/about", search: { q: "1" }, hash: "h" }, rewritten);
	expect(seen).toEqual([{ pathname: "/about", search: "?q=1", hash: "#h" }]);
	expect(target).toMatchObject({ kind: "data", url: "/new?q=1#h", route: "_root_/new" });
	expect(resolveTarget({ to: "_root_/" }, rewritten)).toMatchObject({ url: "/" });
});

it("rewrite off origin", () => {
	const away = context({ rewrite: (location) => ({ ...location, pathname: "//evil.example/x" }) });
	expect(() => resolveTarget({ to: "_root_/about" }, away)).toThrow(/origin/);
});

it("other root", () => {
	expect(resolveTarget({ to: "_admin_/dashboard" }, context())).toEqual({ kind: "document", url: "/dashboard" });
});

it("rewrite throws", () => {
	const broken = context({
		rewrite: () => {
			throw new Error("rewrite failed");
		},
	});
	expect(() => resolveTarget({ to: "_root_/about" }, broken)).toThrow("rewrite failed");
});

it("response page", () => {
	expect(resolveTarget({ to: "_root_/api" }, context())).toEqual({ kind: "document", url: "/api" });
});

it("url target", () => {
	expect(resolveUrl("/about?q=1#h", context())).toMatchObject({
		kind: "data",
		url: "/about?q=1#h",
		dataUrl: "/about?q=1&_flare=data",
		route: "_root_/about",
	});
	expect(resolveUrl("/dashboard", context())).toEqual({ kind: "document", url: "/dashboard" });
	expect(() => resolveUrl("https://evil.example/a", context())).toThrow(/origin/);
});
