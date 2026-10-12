import { expect, it } from "vitest";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter } from "../../shared/router/create-router.ts";
import { createServer } from "./create.ts";

function show(props: { loaderData: unknown }): string {
	return `[${String(props.loaderData)}]`;
}

const root = createRootLayout("_root_").render(show);
const home = createPage("_root_")
	.loader(() => "Home")
	.render(show);
const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_", path: "/", module: home }] });
const server = createServer({ router });

it("page", async () => {
	const response = await server.fetch(new Request("http://localhost/"));
	expect(response.status).toBe(200);
	const body = await response.text();
	expect(body).toContain("[Home]");
	expect(body).toContain("self.flare=");
});

it("miss", async () => {
	const response = await server.fetch(new Request("http://localhost/nope"));
	expect(response.status).toBe(404);
});

it("no authenticate", async () => {
	const seen: unknown[] = [];
	const optional = createPage("_root_")
		.authenticateOptional()
		.loader((ctx) => {
			seen.push(ctx.auth);
			return "anonymous";
		})
		.render(show);
	const app = createServer({
		router: createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_", path: "/", module: optional }] }),
	});
	const response = await app.fetch(new Request("http://localhost/"));
	expect(response.status).toBe(200);
	expect(seen).toEqual([null]);
	const denied = createServer({
		router: createRouter({
			layouts: { _root_: root },
			routeTree: [{ id: "_root_", path: "/", module: createPage("_root_").authenticate().render(show) }],
		}),
	});
	expect((await denied.fetch(new Request("http://localhost/"))).status).toBe(401);
});

it("methods", async () => {
	const status = async (method: string, path: string): Promise<number> =>
		(await server.fetch(new Request(`http://localhost${path}`, { method }))).status;
	expect(await status("HEAD", "/nope")).toBe(404);
	expect(await status("POST", "/nope")).toBe(405);
	expect(await status("POST", "/")).toBe(405);
	expect(await status("OPTIONS", "/")).toBe(204);
	expect(await status("HEAD", "/")).toBe(200);
});

it("security on every status", async () => {
	const required = createPage("_root_/account").authenticate().render(show);
	const app = createServer({
		router: createRouter({
			layouts: { _root_: root },
			routeTree: [
				{ id: "_root_", path: "/", module: home },
				{ id: "_root_/account", path: "/account", module: required },
			],
		}),
	});
	const fetchAt = (path: string, method = "GET"): Promise<Response> =>
		app.fetch(new Request(`https://localhost${path}`, { method }));
	const ok = await fetchAt("/");
	const answers = [
		await fetchAt("/missing"),
		await fetchAt("/account"),
		await fetchAt("/", "POST"),
		await fetchAt("/About"),
	];
	expect(answers.map((response) => response.status)).toEqual([404, 401, 405, 301]);
	const policy = ok.headers.get("permissions-policy");
	expect(policy).not.toBeNull();
	for (const response of answers) {
		expect(response.headers.get("content-security-policy")).toMatch(/script-src/);
		expect(response.headers.get("permissions-policy")).toBe(policy);
		expect(response.headers.get("strict-transport-security")).toBe(ok.headers.get("strict-transport-security"));
	}
});

it("state matches", async () => {
	const response = await server.fetch(new Request("http://localhost/?q=1"));
	const body = await response.text();
	const payload = /self\.flare=(.*?)<\/script>/.exec(body)?.[1];
	if (payload === undefined) throw new Error("state script");
	expect(JSON.parse(payload).matches).toEqual([
		{ id: "_root_", params: {}, search: { q: "1" }, data: null, preloader: null, head: null, error: null },
		{ id: "_root_", params: {}, search: { q: "1" }, data: "Home", preloader: null, head: null, error: null },
	]);
	const tab = createPage("_root_/users/[id]/[[tab]]")
		.loader(() => "user")
		.render(show);
	const users = createServer({
		router: createRouter({
			layouts: { _root_: root },
			routeTree: [{ id: "_root_/users/[id]/[[tab]]", path: "/users/[id]/[[tab]]", module: tab }],
		}),
	});
	const userBody = await (await users.fetch(new Request("http://localhost/users/42"))).text();
	const userState = /self\.flare=(.*?)<\/script>/.exec(userBody)?.[1];
	if (userState === undefined) throw new Error("state script");
	expect(JSON.parse(userState).matches.map((match: { params: unknown }) => match.params)).toEqual([
		{ id: "42" },
		{ id: "42" },
	]);
});
