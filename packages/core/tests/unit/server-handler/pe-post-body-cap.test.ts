import { describe, expect, it, vi } from "vitest";

vi.mock("virtual:flare-is-dev", () => ({ default: false }));

import { SERVER_FN_MAX_BODY_BYTES } from "../../../src/server-fn/index.ts";
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

describe("PE POST body cap", () => {
	it("rejects an oversized form POST with 413", async () => {
		const handler = makeHandler();
		const request = new Request("http://localhost/page", {
			body: "a=".padEnd(SERVER_FN_MAX_BODY_BYTES + 2, "x"),
			headers: { "content-type": "application/x-www-form-urlencoded" },
			method: "POST",
		});
		const response = await handler.fetch(request, {});
		expect(response.status).toBe(413);
		const json = (await response.json()) as { message: string };
		expect(json.message).toBe("Payload too large");
	});

	it("still accepts a small form POST without flare_fn", async () => {
		const handler = makeHandler();
		const formData = new FormData();
		formData.set("name", "test");
		const request = new Request("http://localhost/page", {
			body: formData,
			method: "POST",
		});
		const response = await handler.fetch(request, {});
		expect(response.status).toBe(404);
	});
});
