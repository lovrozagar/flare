import { expect, test } from "@playwright/test"

test.describe("Path-scoped middleware (.use pattern)", () => {
	test("x-dash-scoped header present on /dashboard routes", async ({ request }) => {
		const response = await request.get("/dashboard", {
			headers: { "x-d": "1", "x-test-auth": "user-1" },
		})
		expect(response.headers()["x-dash-scoped"]).toBe("true")
	})

	test("x-dash-scoped header present on /dashboard/settings", async ({ request }) => {
		const response = await request.get("/dashboard/settings", {
			headers: { "x-d": "1", "x-test-auth": "user-1" },
		})
		expect(response.headers()["x-dash-scoped"]).toBe("true")
	})

	test("x-dash-scoped header NOT present on /about", async ({ request }) => {
		const response = await request.get("/about", { headers: { "x-d": "1" } })
		expect(response.headers()["x-dash-scoped"]).toBeUndefined()
	})

	test("x-dash-scoped header NOT present on /", async ({ request }) => {
		const response = await request.get("/", { headers: { "x-d": "1" } })
		expect(response.headers()["x-dash-scoped"]).toBeUndefined()
	})

	test("global middleware still runs alongside scoped", async ({ request }) => {
		const response = await request.get("/dashboard", {
			headers: { "x-d": "1", "x-test-auth": "user-1" },
		})
		expect(response.headers()["x-dash-scoped"]).toBe("true")
		expect(response.headers()["x-request-id"]).toBeTruthy()
		expect(response.headers()["x-middleware-ran"]).toBe("true")
	})
})

test.describe("virtualPath() middleware scoping", () => {
	test("x-virtual-matched header on /users/123", async ({ request }) => {
		const response = await request.get("/users/123", { headers: { "x-d": "1" } })
		expect(response.headers()["x-virtual-matched"]).toBe("true")
	})

	test("x-virtual-matched header on /users/abc", async ({ request }) => {
		const response = await request.get("/users/abc", { headers: { "x-d": "1" } })
		expect(response.headers()["x-virtual-matched"]).toBe("true")
	})

	test("x-virtual-matched NOT on /users (no param)", async ({ request }) => {
		const response = await request.get("/users", { headers: { "x-d": "1" } })
		expect(response.headers()["x-virtual-matched"]).toBeUndefined()
	})

	test("x-virtual-matched NOT on /about", async ({ request }) => {
		const response = await request.get("/about", { headers: { "x-d": "1" } })
		expect(response.headers()["x-virtual-matched"]).toBeUndefined()
	})
})

test.describe("onPage() middleware", () => {
	test("x-route-only present on page request", async ({ request }) => {
		const response = await request.get("/about", { headers: { "x-d": "1" } })
		expect(response.headers()["x-route-only"]).toBe("true")
		expect(response.headers()["x-request-type"]).toBe("page")
	})

	test("x-route-only NOT present on mount (/api)", async ({ request }) => {
		const response = await request.get("/api/health")
		expect(response.headers()["x-route-only"]).toBeUndefined()
	})

	test("x-route-only NOT present on server-fn (/_fn/)", async ({ request }) => {
		/* Use a non-existent fn — we just need to check middleware headers, not the fn result */
		const response = await request.post("/_fn/test", {
			data: JSON.stringify({}),
			headers: { "Content-Type": "application/json" },
		})
		expect(response.headers()["x-route-only"]).toBeUndefined()
	})
})

test.describe("requestType correctness", () => {
	test("page request has requestType 'page'", async ({ request }) => {
		const response = await request.get("/about", { headers: { "x-d": "1" } })
		expect(response.headers()["x-request-type"]).toBe("page")
	})

	test("SSR page request has requestType 'page'", async ({ page }) => {
		const response = await page.goto("/about", { waitUntil: "domcontentloaded" })
		expect(response?.headers()["x-request-type"]).toBe("page")
	})
})

test.describe("Multiple .use() calls coexist", () => {
	test("dashboard gets global + scoped headers", async ({ request }) => {
		const response = await request.get("/dashboard", {
			headers: { "x-d": "1", "x-test-auth": "user-1" },
		})
		/* global */
		expect(response.headers()["x-request-id"]).toBeTruthy()
		expect(response.headers()["x-middleware-ran"]).toBe("true")
		expect(response.headers()["x-route-only"]).toBe("true")
		/* scoped */
		expect(response.headers()["x-dash-scoped"]).toBe("true")
		/* not on dashboard */
		expect(response.headers()["x-virtual-matched"]).toBeUndefined()
	})

	test("/users/42 gets global + virtual headers but not dash-scoped", async ({ request }) => {
		const response = await request.get("/users/42", { headers: { "x-d": "1" } })
		/* global */
		expect(response.headers()["x-request-id"]).toBeTruthy()
		expect(response.headers()["x-middleware-ran"]).toBe("true")
		/* virtual */
		expect(response.headers()["x-virtual-matched"]).toBe("true")
		/* not on users */
		expect(response.headers()["x-dash-scoped"]).toBeUndefined()
	})

	test("/about gets only global headers", async ({ request }) => {
		const response = await request.get("/about", { headers: { "x-d": "1" } })
		/* global */
		expect(response.headers()["x-request-id"]).toBeTruthy()
		expect(response.headers()["x-middleware-ran"]).toBe("true")
		expect(response.headers()["x-route-only"]).toBe("true")
		/* not scoped */
		expect(response.headers()["x-dash-scoped"]).toBeUndefined()
		expect(response.headers()["x-virtual-matched"]).toBeUndefined()
	})
})
