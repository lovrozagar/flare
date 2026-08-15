import { describe, expect, it, vi } from "vitest";

vi.mock("virtual:flare-is-dev", () => ({ default: false }));

import { createRouter } from "../../../src/router-config/index.ts";
import { createServerHandler } from "../../../src/server-handler/index.ts";

function makeHandler() {
	return createServerHandler({
		router: createRouter({
			layouts: {},
			routeTree: { s: {} },
		}),
	});
}

describe("Task 4: formData parse error returns 400", () => {
	it("malformed multipart body returns 400 not 500", async () => {
		const handler = makeHandler();
		const request = new Request("http://localhost/page", {
			body: "this is not valid multipart data",
			headers: { "content-type": "multipart/form-data; boundary=----invalid" },
			method: "POST",
		});
		const response = await handler.fetch(request, {});
		expect(response.status).toBe(400);
	});

	it("truncated form body returns 400", async () => {
		const handler = makeHandler();
		const request = new Request("http://localhost/submit", {
			body: '------boundary\r\nContent-Disposition: form-data; name="field"\r\n\r\nval',
			headers: { "content-type": "multipart/form-data; boundary=----boundary" },
			method: "POST",
		});
		const response = await handler.fetch(request, {});
		expect(response.status).toBe(400);
	});

	it("valid form POST without __flare_fn falls through to SSR", async () => {
		const handler = makeHandler();
		const formData = new FormData();
		formData.set("name", "test");
		const request = new Request("http://localhost/page", {
			body: formData,
			method: "POST",
		});
		const response = await handler.fetch(request, {});
		/* No __flare_fn → falls through to normal SSR → 404 (no routes) */
		expect(response.status).toBe(404);
	});
});
