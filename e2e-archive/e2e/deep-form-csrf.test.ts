import { expect, test } from "@playwright/test"
import { loadPage } from "./helpers"

const BASE = "https://localhost:3999"

/* ── CSRF Origin validation — server rejects cross-origin POSTs ────── */

test.describe("Form actions — CSRF Origin validation", () => {
	test("CSRF-E1: same-origin fetch succeeds (normal form submit)", async ({ page }) => {
		await loadPage(page, "/forms/contact")

		await page.getByTestId("email-input").fill("user@test.com")
		await page.getByTestId("message-input").fill("Hello")
		await page.getByTestId("submit-btn").click()

		await expect(page.getByTestId("success-message")).toHaveText("Message sent!", { timeout: 5000 })
	})

	test("CSRF-E2: cross-origin POST returns 403", async ({ request }) => {
		const fd = new URLSearchParams()
		fd.append("email", "user@test.com")
		fd.append("message", "Hello")

		const res = await request.post(`${BASE}/_fn/form-contact/form-contact`, {
			data: fd.toString(),
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				origin: "http://evil.com",
			},
		})
		expect(res.status()).toBe(403)
		const json = (await res.json()) as Record<string, string>
		expect(json.message).toBe("Origin mismatch")
	})

	test("CSRF-E3: cross-origin JSON POST returns 403", async ({ request }) => {
		const res = await request.post(`${BASE}/_fn/form-contact/form-contact`, {
			data: { email: "user@test.com", message: "Hello" },
			headers: {
				"content-type": "application/json",
				origin: "http://evil.com",
			},
		})
		expect(res.status()).toBe(403)
		const json = (await res.json()) as Record<string, string>
		expect(json.message).toBe("Origin mismatch")
	})

	test("CSRF-E4: missing Origin header allows request (non-browser)", async ({ request }) => {
		const res = await request.post(`${BASE}/_fn/form-contact/form-contact`, {
			data: { email: "user@test.com", message: "Hello" },
			headers: {
				"content-type": "application/json",
			},
		})
		expect(res.status()).toBe(200)
		const json = (await res.json()) as { data: Record<string, unknown> }
		expect(json.data.sent).toBe(true)
	})

	test("CSRF-E5: same-origin POST allowed", async ({ request }) => {
		const res = await request.post(`${BASE}/_fn/form-contact/form-contact`, {
			data: { email: "user@test.com", message: "Hello" },
			headers: {
				"content-type": "application/json",
				origin: BASE,
			},
		})
		expect(res.status()).toBe(200)
	})

	test("CSRF-E6: port mismatch rejected", async ({ request }) => {
		const res = await request.post(`${BASE}/_fn/form-contact/form-contact`, {
			data: { email: "user@test.com", message: "Hello" },
			headers: {
				"content-type": "application/json",
				origin: "http://localhost:9999",
			},
		})
		expect(res.status()).toBe(403)
	})

	test("CSRF-E7: scheme mismatch rejected", async ({ request }) => {
		const res = await request.post(`${BASE}/_fn/form-contact/form-contact`, {
			data: { email: "user@test.com", message: "Hello" },
			headers: {
				"content-type": "application/json",
				origin: "http://localhost:3999",
			},
		})
		expect(res.status()).toBe(403)
	})

	test("CSRF-E8: null origin rejected (sandboxed iframe)", async ({ request }) => {
		const res = await request.post(`${BASE}/_fn/form-contact/form-contact`, {
			data: { email: "user@test.com", message: "Hello" },
			headers: {
				"content-type": "application/json",
				origin: "null",
			},
		})
		expect(res.status()).toBe(403)
	})

	test("CSRF-E9: cross-origin blocked before auth check (401 not reached)", async ({ request }) => {
		/* form-auth requires authenticate — without auth header, same-origin gets 401.
		 * Cross-origin should get 403 (CSRF) before auth is checked. */
		const res = await request.post(`${BASE}/_fn/form-auth/form-auth`, {
			data: { note: "test" },
			headers: {
				"content-type": "application/json",
				origin: "http://evil.com",
			},
		})
		expect(res.status()).toBe(403)
		const json = (await res.json()) as Record<string, string>
		expect(json.message).toBe("Origin mismatch")
	})

	test("CSRF-E10: cross-origin blocked before validation (400 not reached)", async ({
		request,
	}) => {
		/* Empty body would normally trigger validation error (400).
		 * Cross-origin should get 403 first. */
		const res = await request.post(`${BASE}/_fn/form-contact/form-contact`, {
			data: {},
			headers: {
				"content-type": "application/json",
				origin: "http://evil.com",
			},
		})
		expect(res.status()).toBe(403)
	})
})

/* ── CSRF — PE (no-JS) path ──────────────────────────────────────── */

test.describe("Form actions — CSRF — PE path (JS off)", () => {
	test.use({ javaScriptEnabled: false })

	test("CSRF-E11: no-JS form submit works (same-origin)", async ({ page }) => {
		await page.goto("/forms/contact")
		await page.getByTestId("email-input").fill("user@test.com")
		await page.getByTestId("message-input").fill("Hello")
		await page.getByTestId("submit-btn").click()

		/* 303 PRG redirect back to same page */
		await expect(page).toHaveURL(/\/forms\/contact/)
	})

	test("CSRF-E12: no-JS PE path cross-origin blocked", async ({ request }) => {
		/* POST to page URL with __flare_fn (PE path) from cross-origin */
		const fd = new URLSearchParams()
		fd.append("__flare_fn", "form-contact")
		fd.append("email", "user@test.com")
		fd.append("message", "Hello")

		const res = await request.post(`${BASE}/forms/contact`, {
			data: fd.toString(),
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				origin: "http://evil.com",
			},
			maxRedirects: 0,
		})
		/* PE path forwards headers to handleServerFnRequest which checks origin */
		expect(res.status()).toBe(403)
	})
})
