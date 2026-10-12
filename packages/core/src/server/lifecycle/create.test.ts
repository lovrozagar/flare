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
