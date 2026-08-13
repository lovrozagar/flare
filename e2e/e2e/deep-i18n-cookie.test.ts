import { expect, test } from "@playwright/test"
import { BASE } from "./helpers"

const BROWSER_UA =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"

/* ── Raw HTTP: server sends Set-Cookie ──────────────────────────────── */

test.describe("i18n cookie — raw HTTP Set-Cookie", () => {
	test("SSR /about: no cookie → Set-Cookie: en", async ({ request }) => {
		const res = await request.get(`${BASE}/about`, {
			headers: { "user-agent": BROWSER_UA },
		})
		expect(res.headers()["set-cookie"]).toContain("flare.locale=en")
	})

	test("SSR /about: cookie=en → no Set-Cookie", async ({ request }) => {
		const res = await request.get(`${BASE}/about`, {
			headers: { cookie: "flare.locale=en", "user-agent": BROWSER_UA },
		})
		expect(res.headers()["set-cookie"] ?? "").not.toContain("flare.locale=")
	})

	test("SSR /about: cookie=fr → 302 redirect to /fr/about (cookie-respect)", async ({
		request,
	}) => {
		const res = await request.get(`${BASE}/about`, {
			headers: { cookie: "flare.locale=fr", "user-agent": BROWSER_UA },
			maxRedirects: 0,
		})
		expect(res.status()).toBe(302)
		expect(res.headers()["location"]).toContain("/fr/about")
	})

	test("NDJSON /about: no cookie → Set-Cookie: en", async ({ request }) => {
		const res = await request.get(`${BASE}/about`, {
			headers: { "user-agent": BROWSER_UA, "x-d": "1" },
		})
		expect(res.status()).toBe(200)
		expect(res.headers()["set-cookie"]).toContain("flare.locale=en")
	})

	test("NDJSON /about: cookie=en → no Set-Cookie", async ({ request }) => {
		const res = await request.get(`${BASE}/about`, {
			headers: { cookie: "flare.locale=en", "user-agent": BROWSER_UA, "x-d": "1" },
		})
		expect(res.status()).toBe(200)
		expect(res.headers()["set-cookie"] ?? "").not.toContain("flare.locale=")
	})

	test("NDJSON /hr/about: cookie=en → Set-Cookie: hr", async ({ request }) => {
		const res = await request.get(`${BASE}/hr/about`, {
			headers: { cookie: "flare.locale=en", "user-agent": BROWSER_UA, "x-d": "1" },
		})
		expect(res.headers()["set-cookie"]).toContain("flare.locale=hr")
	})

	test("NDJSON /fr/about: cookie=hr → Set-Cookie: fr", async ({ request }) => {
		const res = await request.get(`${BASE}/fr/about`, {
			headers: { cookie: "flare.locale=hr", "user-agent": BROWSER_UA, "x-d": "1" },
		})
		expect(res.headers()["set-cookie"]).toContain("flare.locale=fr")
	})

	test("NDJSON /about: cookie=fr → Set-Cookie: en", async ({ request }) => {
		const res = await request.get(`${BASE}/about`, {
			headers: { cookie: "flare.locale=fr", "user-agent": BROWSER_UA, "x-d": "1" },
		})
		expect(res.status()).toBe(200)
		expect(res.headers()["set-cookie"]).toContain("flare.locale=en")
	})

	test("NDJSON full cycle: en→hr→fr→en→hr→fr", async ({ request }) => {
		const get = (path: string, cookie?: string) =>
			request.get(`${BASE}${path}`, {
				headers: {
					...(cookie ? { cookie } : {}),
					"user-agent": BROWSER_UA,
					"x-d": "1",
				},
			})

		const r1 = await get("/about")
		expect(r1.headers()["set-cookie"]).toContain("flare.locale=en")

		const r2 = await get("/hr/about", "flare.locale=en")
		expect(r2.headers()["set-cookie"]).toContain("flare.locale=hr")

		const r3 = await get("/fr/about", "flare.locale=hr")
		expect(r3.headers()["set-cookie"]).toContain("flare.locale=fr")

		const r4 = await get("/about", "flare.locale=fr")
		expect(r4.headers()["set-cookie"]).toContain("flare.locale=en")

		/* Second cycle */
		const r5 = await get("/hr/about", "flare.locale=en")
		expect(r5.headers()["set-cookie"]).toContain("flare.locale=hr")

		const r6 = await get("/fr/about", "flare.locale=hr")
		expect(r6.headers()["set-cookie"]).toContain("flare.locale=fr")
	})
})

/* ── Prefetch must NOT set cookies ─────────────────────────────────── */

test.describe("i18n cookie — prefetch must not overwrite", () => {
	test("prefetch /hr with cookie=en → no Set-Cookie", async ({ request }) => {
		const res = await request.get(`${BASE}/hr/about`, {
			headers: { cookie: "flare.locale=en", "user-agent": BROWSER_UA, "x-d": "1", "x-p": "1" },
		})
		expect(res.headers()["set-cookie"] ?? "").not.toContain("flare.locale=")
	})

	test("prefetch /fr with cookie=en → no Set-Cookie", async ({ request }) => {
		const res = await request.get(`${BASE}/fr/about`, {
			headers: { cookie: "flare.locale=en", "user-agent": BROWSER_UA, "x-d": "1", "x-p": "1" },
		})
		expect(res.headers()["set-cookie"] ?? "").not.toContain("flare.locale=")
	})

	test("prefetch / with cookie=fr → no Set-Cookie", async ({ request }) => {
		const res = await request.get(`${BASE}/about`, {
			headers: { cookie: "flare.locale=fr", "user-agent": BROWSER_UA, "x-d": "1", "x-p": "1" },
		})
		expect(res.headers()["set-cookie"] ?? "").not.toContain("flare.locale=")
	})

	test("non-prefetch same path still sets cookie", async ({ request }) => {
		const res = await request.get(`${BASE}/hr/about`, {
			headers: { cookie: "flare.locale=en", "user-agent": BROWSER_UA, "x-d": "1" },
		})
		expect(res.headers()["set-cookie"]).toContain("flare.locale=hr")
	})
})

/* ── Browser: cookie jar updates from NDJSON fetch ──────────────────── */

test.describe("i18n cookie — browser NDJSON fetch cycle", () => {
	test("en → hr → fr → en: cookie updates on every NDJSON fetch", async ({ page }) => {
		/* Step 1: SSR load /about → cookie=en */
		await page.goto(`${BASE}/about`)
		await page.waitForSelector("[data-testid=about]")
		let cookies = await page.context().cookies()
		let lc = cookies.find((c) => c.name === "flare.locale")
		expect(lc?.value).toBe("en")

		/* Step 2: NDJSON fetch /hr/about → cookie should become hr
		 * Route may 404 but Set-Cookie is still processed by browser */
		await page.evaluate(async () => {
			const res = await fetch("/hr/about", { headers: { "x-d": "1" } })
			await res.text()
		})
		cookies = await page.context().cookies()
		lc = cookies.find((c) => c.name === "flare.locale")
		expect(lc?.value).toBe("hr")

		/* Step 3: NDJSON fetch /fr/about → cookie should become fr */
		await page.evaluate(async () => {
			const res = await fetch("/fr/about", { headers: { "x-d": "1" } })
			await res.text()
		})
		cookies = await page.context().cookies()
		lc = cookies.find((c) => c.name === "flare.locale")
		expect(lc?.value).toBe("fr")

		/* Step 4: NDJSON fetch /about → cookie should become en */
		await page.evaluate(async () => {
			const res = await fetch("/about", { headers: { "x-d": "1" } })
			await res.text()
		})
		cookies = await page.context().cookies()
		lc = cookies.find((c) => c.name === "flare.locale")
		expect(lc?.value).toBe("en")

		/* Step 5-7: Second full cycle to prove no stuck state */
		await page.evaluate(async () => {
			const res = await fetch("/hr/about", { headers: { "x-d": "1" } })
			await res.text()
		})
		cookies = await page.context().cookies()
		lc = cookies.find((c) => c.name === "flare.locale")
		expect(lc?.value).toBe("hr")

		await page.evaluate(async () => {
			const res = await fetch("/fr/about", { headers: { "x-d": "1" } })
			await res.text()
		})
		cookies = await page.context().cookies()
		lc = cookies.find((c) => c.name === "flare.locale")
		expect(lc?.value).toBe("fr")

		await page.evaluate(async () => {
			const res = await fetch("/about", { headers: { "x-d": "1" } })
			await res.text()
		})
		cookies = await page.context().cookies()
		lc = cookies.find((c) => c.name === "flare.locale")
		expect(lc?.value).toBe("en")
	})

	test("non-default locales cycle: hr → fr → hr", async ({ page }) => {
		/* Start at /about, get initial cookie */
		await page.goto(`${BASE}/about`)
		await page.waitForSelector("[data-testid=about]")

		/* Navigate to hr */
		await page.evaluate(async () => {
			const res = await fetch("/hr/about", { headers: { "x-d": "1" } })
			await res.text()
		})
		let cookies = await page.context().cookies()
		let lc = cookies.find((c) => c.name === "flare.locale")
		expect(lc?.value).toBe("hr")

		/* Navigate to fr */
		await page.evaluate(async () => {
			const res = await fetch("/fr/about", { headers: { "x-d": "1" } })
			await res.text()
		})
		cookies = await page.context().cookies()
		lc = cookies.find((c) => c.name === "flare.locale")
		expect(lc?.value).toBe("fr")

		/* Back to hr */
		await page.evaluate(async () => {
			const res = await fetch("/hr/about", { headers: { "x-d": "1" } })
			await res.text()
		})
		cookies = await page.context().cookies()
		lc = cookies.find((c) => c.name === "flare.locale")
		expect(lc?.value).toBe("hr")
	})
})
