import { expect, it } from "vitest";
import { createRouter } from "../../shared/router/create-router.ts";
import { createServer } from "./create.ts";

const router = createRouter({ layouts: { _root_: {} }, routeTree: [{ id: "_root_", path: "/" }] });
const server = createServer({ router, page: { id: "_root_", loader: () => ({ sentinel: "Home" }) } });

it("page", async () => {
	const response = await server.fetch(new Request("http://localhost/"));
	expect(response.status).toBe(200);
	const body = await response.text();
	expect(body).toContain("Home");
	expect(body).toContain("self.flare=");
});

it("miss", async () => {
	const response = await server.fetch(new Request("http://localhost/nope"));
	expect(response.status).toBe(404);
});
