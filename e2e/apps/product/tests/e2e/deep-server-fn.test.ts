import { expect, test } from "@playwright/test";
import { BASE } from "./helpers";

test.describe("Deep: server function POST echo", () => {
	test("POST call returns { data: result }", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/echo/echo`, {
			data: { message: "hello" },
		});
		expect(response.status()).toBe(200);
		const json = (await response.json()) as Record<string, unknown>;
		expect(json.data).toEqual({ echo: "hello" });
	});

	test("POST with different input returns correct echo", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/echo/echo`, {
			data: { message: "world" },
		});
		const json = (await response.json()) as Record<string, unknown>;
		expect(json.data).toEqual({ echo: "world" });
	});
});

test.describe("Deep: server function GET", () => {
	test("GET call with search params returns data", async ({ page }) => {
		const response = await page.request.get(`${BASE}/_fn/get-greeting/get-greeting?name=Alice`);
		expect(response.status()).toBe(200);
		const json = (await response.json()) as Record<string, unknown>;
		expect(json.data).toEqual({ greeting: "Hello, Alice!" });
	});
});

test.describe("Deep: server function authentication", () => {
	test("auth-gated function returns 401 without auth", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/auth-gated/auth-gated`, {
			data: {},
		});
		expect(response.status()).toBe(401);
	});

	test("auth-gated function succeeds with auth header", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/auth-gated/auth-gated`, {
			data: {},
			headers: { "x-test-auth": "user-123" },
		});
		expect(response.status()).toBe(200);
		const json = (await response.json()) as Record<string, unknown>;
		const data = json.data as Record<string, unknown>;
		expect(data.secret).toBe("classified");
		expect(data.userId).toBe("user-123");
	});
});

test.describe("Deep: server function input validation", () => {
	test("400 on invalid input", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/validated/validated`, {
			data: { age: -5 },
		});
		expect(response.status()).toBe(400);
		const json = (await response.json()) as Record<string, unknown>;
		expect(json.message).toContain("age");
	});

	test("400 on missing input", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/validated/validated`, {
			data: {},
		});
		expect(response.status()).toBe(400);
	});

	test("200 on valid input", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/validated/validated`, {
			data: { age: 25 },
		});
		expect(response.status()).toBe(200);
		const json = (await response.json()) as Record<string, unknown>;
		expect(json.data).toEqual({ valid: true, years: 25 });
	});
});

test.describe("Deep: server function authorization", () => {
	test("403 when authorize rejects", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/authorized/authorized`, {
			data: {},
			headers: { "x-test-auth": "regular-user" },
		});
		expect(response.status()).toBe(403);
	});

	test("200 when authorize passes (admin)", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/authorized/authorized`, {
			data: {},
			headers: { "x-test-auth": "admin" },
		});
		expect(response.status()).toBe(200);
		const json = (await response.json()) as Record<string, unknown>;
		expect(json.data).toEqual({ access: "granted" });
	});

	test("401 when auth required but not provided", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/authorized/authorized`, {
			data: {},
		});
		expect(response.status()).toBe(401);
	});
});

test.describe("Deep: server function error handling", () => {
	test("handler error returns 500", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/error-fn/error-fn`, {
			data: {},
		});
		expect(response.status()).toBe(500);
		const json = (await response.json()) as Record<string, unknown>;
		expect(json.message).toBe("Internal server error");
	});
});

test.describe("Deep: server function method enforcement", () => {
	test("POST-only rejects GET with 405", async ({ page }) => {
		const response = await page.request.get(`${BASE}/_fn/echo/echo`);
		expect(response.status()).toBe(405);
		const json = (await response.json()) as Record<string, unknown>;
		expect(json.message).toBe("Method not allowed");
	});

	test("GET-only rejects POST with 405", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/get-greeting/get-greeting`, {
			data: { name: "Bob" },
		});
		expect(response.status()).toBe(405);
	});
});

test.describe("Deep: server function 404", () => {
	test("unknown function returns 404", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/unknown/unknown`, {
			data: {},
		});
		expect(response.status()).toBe(404);
	});

	test("wrong name for valid ID returns 404", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/echo/wrong-name`, {
			data: {},
		});
		expect(response.status()).toBe(404);
	});
});

test.describe("Deep: server function middleware headers", () => {
	test("middleware headers apply to server-fn responses", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/echo/echo`, {
			data: { message: "test" },
		});
		expect(response.headers()["x-middleware-ran"]).toBe("true");
		expect(response.headers()["x-request-id"]).toBeDefined();
		expect(response.headers()["x-timing"]).toBeDefined();
	});
});

test.describe("Deep: server function security headers", () => {
	test("security headers present on server-fn response", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/echo/echo`, {
			data: { message: "test" },
		});
		const headers = response.headers();
		expect(headers["x-content-type-options"]).toBe("nosniff");
		expect(headers["x-frame-options"]).toBeDefined();
	});
});

/* ── Streaming server functions ────────────────────────────────────── */

function parseNDJSON(text: string): unknown[] {
	return text
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as unknown);
}

test.describe("Deep: streaming server function", () => {
	test("POST to stream fn returns chunked NDJSON response", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/stream-count/stream-count`, {
			data: {},
		});
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toBe("text/x-ndjson");
		const messages = parseNDJSON(await response.text());
		expect(messages.length).toBeGreaterThan(0);
	});

	test("all chunks parseable and arrive in order", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/stream-count/stream-count`, {
			data: {},
		});
		const messages = parseNDJSON(await response.text());
		const chunks = messages.filter((m): m is { c: number } => "c" in (m as Record<string, unknown>)).map((m) => m.c);
		expect(chunks).toEqual([1, 2, 3, 4, 5]);
	});

	test("done message present at end", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/stream-count/stream-count`, {
			data: {},
		});
		const messages = parseNDJSON(await response.text());
		expect(messages[messages.length - 1]).toEqual({ d: true });
	});

	test("auth failure on stream fn returns JSON 401", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/stream-auth/stream-auth`, {
			data: {},
		});
		expect(response.status()).toBe(401);
		expect(response.headers()["content-type"]).toBe("application/json; charset=utf-8");
	});

	test("stream fn error mid-stream includes error message in NDJSON", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/stream-error/stream-error`, {
			data: {},
		});
		const messages = parseNDJSON(await response.text());
		expect(messages).toContainEqual({ c: "chunk-1" });
		expect(messages).toContainEqual({ c: "chunk-2" });
		expect(messages).toContainEqual({ e: { message: "stream failed" } });
	});

	test("security/middleware headers present on stream response", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/stream-count/stream-count`, {
			data: {},
		});
		const headers = response.headers();
		expect(headers["x-content-type-options"]).toBe("nosniff");
		expect(headers["x-middleware-ran"]).toBe("true");
	});

	test("stream fn with auth succeeds when auth provided", async ({ page }) => {
		const response = await page.request.post(`${BASE}/_fn/stream-auth/stream-auth`, {
			data: {},
			headers: { "x-test-auth": "alice" },
		});
		expect(response.status()).toBe(200);
		const messages = parseNDJSON(await response.text());
		const chunks = messages.filter((m): m is { c: string } => "c" in (m as Record<string, unknown>)).map((m) => m.c);
		expect(chunks).toEqual(["Hello, alice", "Welcome!"]);
	});
});
