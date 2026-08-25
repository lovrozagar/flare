import { expect, test } from "@playwright/test";

test.describe("server functions", () => {
	test("POST echo returns { data }", async ({ request }) => {
		const response = await request.post("/_flare/server-fn/echo/echo", {
			data: { message: "hello" },
		});
		expect(response.status()).toBe(200);
		expect((await response.json()).data).toEqual({ echo: "hello" });
	});

	test("GET greeting", async ({ request }) => {
		const response = await request.get("/_flare/server-fn/get-greeting/get-greeting?name=Alice");
		expect(response.status()).toBe(200);
		expect((await response.json()).data).toEqual({ greeting: "Hello, Alice!" });
	});

	test("auth-gated 401 without header", async ({ request }) => {
		const response = await request.post("/_flare/server-fn/auth-gated/auth-gated", { data: {} });
		expect(response.status()).toBe(401);
	});

	test("auth-gated succeeds with x-test-auth", async ({ request }) => {
		const response = await request.post("/_flare/server-fn/auth-gated/auth-gated", {
			data: {},
			headers: { "x-test-auth": "user-123" },
		});
		expect(response.status()).toBe(200);
		const data = (await response.json()).data as { secret: string; userId: string };
		expect(data.secret).toBe("classified");
		expect(data.userId).toBe("user-123");
	});

	test("handler throw is an error response", async ({ request }) => {
		const response = await request.post("/_flare/server-fn/error-fn/error-fn", { data: {} });
		expect(response.status()).toBeGreaterThanOrEqual(400);
	});

	test("wrong method is rejected", async ({ request }) => {
		const response = await request.get("/_flare/server-fn/echo/echo");
		expect(response.status()).toBeGreaterThanOrEqual(400);
	});
});
