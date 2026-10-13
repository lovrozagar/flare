import { expect, it } from "vitest";
import { createServer } from "../../../server/lifecycle/create.ts";
import { createMiddleware } from "../../../server/middleware/index.ts";
import { createPage } from "../../../shared/route-builder/page.ts";
import { createRootLayout } from "../../../shared/route-builder/root-layout.ts";
import { createRouter, type RouteModule } from "../../../shared/router/create-router.ts";
import { i18n } from "./middleware.ts";

const root = createRootLayout("_root_").render((props) => props.children);
const shared = createPage("_root_/[[locale]]/pricing")
	.cache({ ssr: { ttl: "1h" }, cdn: { maxAge: "60s" } })
	.render(() => "pricing");
const owned = createPage("_root_/[[locale]]/account").render(() => "account");
const home = createPage("_root_/[[locale]]").render(() => "home");
const docs = createPage("_root_/[locale]/docs").render(() => "docs");

const node = (id: string, path: string, module: RouteModule) => ({ id, path, module });
const router = createRouter({
	layouts: { _root_: root },
	routeTree: [
		node("_root_/[[locale]]", "/[[locale]]", home),
		node("_root_/[[locale]]/pricing", "/[[locale]]/pricing", shared),
		node("_root_/[[locale]]/account", "/[[locale]]/account", owned),
		node("_root_/[locale]/docs", "/[locale]/docs", docs),
	],
});
const locale = i18n({ locales: ["en", "hr"], defaultLocale: "en" });
const server = createServer({ router, locale });

type Ask = { cookie?: string; language?: string; origin?: string };

function get(path: string, options: Ask = {}): Promise<Response> {
	const headers = new Headers();
	if (options.cookie !== undefined) headers.set("cookie", `flare.locale=${options.cookie}`);
	if (options.language !== undefined) headers.set("accept-language", options.language);
	return server.fetch(new Request(`${options.origin ?? "http://site.test"}${path}`, { headers }));
}

// The slot runs after mounts and before the middleware list: its redirect never reaches a middleware.
it("slot", async () => {
	const seen: string[] = [];
	const watch = createMiddleware(({ path, next }) => {
		seen.push(path);
		return next();
	});
	const watched = createServer({ router, locale, middleware: [watch] });
	const ask = new Request("http://site.test/pricing", { headers: { cookie: "flare.locale=hr" } });
	const redirected = await watched.fetch(ask);
	expect(redirected.status).toBe(302);
	expect(seen).toEqual([]);
	expect((await watched.fetch(new Request("http://site.test/hr/pricing"))).status).toBe(200);
	expect(seen).toEqual(["/hr/pricing"]);
});

it("not a middleware", () => {
	// @ts-expect-error the locale slot is not a middleware
	const wrong = { router, middleware: [locale] } satisfies Parameters<typeof createServer>[0];
	expect(wrong.middleware).toHaveLength(1);
});

// A locale-like segment on a URL no route matches is not redirected. The router answers it.
it("redirect is a route", async () => {
	const response = await get("/hr/nowhere/at/all");
	expect(response.status).toBe(404);
	expect(response.headers.get("location")).toBeNull();
});

it("cookie on redirect", async () => {
	const response = await get("/fr/pricing?x=1");
	expect(response.status).toBe(302);
	expect(response.headers.get("location")).toBe("/pricing?x=1");
	expect(response.headers.get("cache-control")).toBe("private, no-store");
	expect(response.headers.getSetCookie()).toEqual(["flare.locale=en; Path=/; SameSite=Lax; Max-Age=31536000"]);
	expect(response.headers.get("vary")).toBeNull();
});

// The data answer after setLocale(default) on a shared page would persist `en`, but a shared answer never carries it.
it("cookie on shared", async () => {
	const response = await get("/pricing?_flare=data", { cookie: "hr" });
	expect(response.status).toBe(200);
	expect(response.headers.get("cache-control")).toMatch(/^public/);
	expect(response.headers.getSetCookie()).toEqual([]);
	const document = await get("/hr/pricing");
	expect(document.headers.get("cache-control")).toMatch(/^public/);
	expect(document.headers.getSetCookie()).toEqual([]);
});

it("cookie on private", async () => {
	const response = await get("/account?_flare=data", { cookie: "hr" });
	expect(response.headers.get("cache-control")).toBe("private, no-store");
	expect(response.headers.getSetCookie()).toEqual(["flare.locale=en; Path=/; SameSite=Lax; Max-Age=31536000"]);
});

it("cookie attrs", async () => {
	const plain = (await get("/fr/docs")).headers.getSetCookie()[0] ?? "";
	const secure = (await get("/fr/docs", { origin: "https://site.test" })).headers.getSetCookie()[0] ?? "";
	expect(plain).toBe("flare.locale=en; Path=/; SameSite=Lax; Max-Age=31536000");
	expect(secure).toBe("flare.locale=en; Path=/; SameSite=Lax; Max-Age=31536000; Secure");
	expect(`${plain}${secure}`).not.toMatch(/Domain/i);
});

it("cookie replaced", async () => {
	const response = await get("/pricing", { cookie: "nope", language: "hr" });
	expect(response.status).toBe(302);
	expect(response.headers.getSetCookie()).toEqual(["flare.locale=hr; Path=/; SameSite=Lax; Max-Age=31536000"]);
	expect(JSON.stringify([...response.headers])).not.toContain("nope");
});

it("negotiate 302", async () => {
	const response = await get("/?q=1", { cookie: "hr" });
	expect(response.status).toBe(302);
	expect(response.headers.get("location")).toBe("/hr?q=1");
	expect(response.headers.get("cache-control")).toBe("private, no-store");
	const header = await get("/pricing?x=1", { language: "hr" });
	expect(header.headers.get("location")).toBe("/hr/pricing?x=1");
	// The default tag on an optional segment shows as no segment, so it is already on the URL.
	expect((await get("/pricing", { cookie: "en" })).status).toBe(200);
});

it("data cookie", async () => {
	const response = await get("/account?_flare=data", { language: "hr" });
	expect(response.status).toBe(200);
	expect(response.headers.get("location")).toBeNull();
	expect(response.headers.getSetCookie()).toEqual(["flare.locale=en; Path=/; SameSite=Lax; Max-Age=31536000"]);
	// A cookie that already holds the tag the URL shows is not written again.
	expect((await get("/hr/account?_flare=data", { cookie: "hr" })).headers.getSetCookie()).toEqual([]);
});

it("prefetch quiet", async () => {
	const response = await get("/account?_flare=prefetch", { cookie: "hr" });
	expect(response.headers.get("location")).toBeNull();
	expect(response.headers.getSetCookie()).toEqual([]);
});

it("default missing", () => {
	expect(() => i18n({ locales: ["en"], defaultLocale: "hr" })).toThrow("i18n defaultLocale hr is not in locales");
});
