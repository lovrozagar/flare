import { expect, test } from "@playwright/test";

/*
 * i18n middleware behavior:
 *
 * COOKIE RULES:
 * - /fr hard nav → serve fr, set cookie=fr
 * - /hr hard nav → serve hr, set cookie=hr
 * - / (no cookie)  → serve en, set cookie=en
 * - / (cookie=fr)  → 302 → /fr (cookie respected)
 * - / (cookie=en)  → serve en, no redirect
 * - /en/about      → 302 → /about, set cookie=en (strip default prefix)
 * - NDJSON (x-d:1) → no cookie redirect, URL is truth
 * - Prefetch (x-p:1) → no cookie set at all
 * - Bot            → always default, no redirect
 *
 * CONTENT:
 * en: "Welcome", "About", "Hello {name}", "Flare Real World"
 * hr: "Dobrodosli", "O nama", "Bok {name}", "Flare Real World"
 * fr: "Bienvenue", "A propos", "Bonjour {name}", "Flare Real World"
 */

const BROWSER_UA =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

function getCookie(headers: Record<string, string>, name: string): string | null {
	const raw = headers["set-cookie"];
	if (!raw) return null;
	const match = raw.match(new RegExp(`${name}=([^;]+)`));
	return match?.[1] ?? null;
}

/** Navigate + wait for SolidJS hydration before any click interaction */
async function gotoHydrated(page: import("@playwright/test").Page, url: string) {
	await page.goto(url);
	await page.waitForSelector("html[data-hydrated]", { timeout: 10000 });
}

/* ── 1. Hard nav — no cookie ──────────────────────────────────────── */

test.describe("hard nav — no cookie", () => {
	test("/ → English content, lang=en, cookie=en", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByTestId("welcome-title")).toHaveText("Welcome");
		expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
		const cookies = await page.context().cookies();
		expect(cookies.find((c) => c.name === "flare.locale")?.value).toBe("en");
	});

	test("/hr → Croatian content, lang=hr, cookie=hr", async ({ page }) => {
		await page.goto("/hr");
		await expect(page.getByTestId("welcome-title")).toHaveText("Dobrodosli");
		expect(await page.evaluate(() => document.documentElement.lang)).toBe("hr");
		const cookies = await page.context().cookies();
		expect(cookies.find((c) => c.name === "flare.locale")?.value).toBe("hr");
	});

	test("/fr → French content, lang=fr, cookie=fr", async ({ page }) => {
		await page.goto("/fr");
		await expect(page.getByTestId("welcome-title")).toHaveText("Bienvenue");
		expect(await page.evaluate(() => document.documentElement.lang)).toBe("fr");
		const cookies = await page.context().cookies();
		expect(cookies.find((c) => c.name === "flare.locale")?.value).toBe("fr");
	});

	test("/about → English about", async ({ page }) => {
		await page.goto("/about");
		await expect(page.getByTestId("about-title")).toHaveText("About");
	});

	test("/hr/about → Croatian about", async ({ page }) => {
		await page.goto("/hr/about");
		await expect(page.getByTestId("about-title")).toHaveText("O nama");
	});

	test("/fr/about → French about", async ({ page }) => {
		await page.goto("/fr/about");
		await expect(page.getByTestId("about-title")).toHaveText("A propos");
	});
});

/* ── 2. Cookie-respect redirect — unprefixed SSR paths ────────────── */

test.describe("cookie-respect redirect", () => {
	test("/ + cookie=hr → 302 → /hr", async ({ request }) => {
		const res = await request.get("/", {
			headers: { cookie: "flare.locale=hr", "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
		expect(res.headers()["location"]).toContain("/hr");
	});

	test("/ + cookie=fr → 302 → /fr", async ({ request }) => {
		const res = await request.get("/", {
			headers: { cookie: "flare.locale=fr", "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
		expect(res.headers()["location"]).toContain("/fr");
	});

	test("/ + cookie=en → 200 (no redirect, default)", async ({ request }) => {
		const res = await request.get("/", {
			headers: { cookie: "flare.locale=en", "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(200);
	});

	test("/about + cookie=hr → 302 → /hr/about", async ({ request }) => {
		const res = await request.get("/about", {
			headers: { cookie: "flare.locale=hr", "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
		expect(res.headers()["location"]).toContain("/hr/about");
	});

	test("/about + cookie=fr → 302 → /fr/about", async ({ request }) => {
		const res = await request.get("/about", {
			headers: { cookie: "flare.locale=fr", "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
		expect(res.headers()["location"]).toContain("/fr/about");
	});

	test("/about + cookie=en → 200 (no redirect)", async ({ request }) => {
		const res = await request.get("/about", {
			headers: { cookie: "flare.locale=en", "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(200);
	});
});

/* ── 3. Explicit locale URL wins over cookie ──────────────────────── */

test.describe("explicit locale URL wins over cookie", () => {
	test("/hr + cookie=fr → 200 Croatian (URL wins)", async ({ request }) => {
		const res = await request.get("/hr", {
			headers: { cookie: "flare.locale=fr", "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(200);
		expect(await res.text()).toContain("Dobrodosli");
		expect(getCookie(res.headers(), "flare.locale")).toBe("hr");
	});

	test("/fr + cookie=hr → 200 French (URL wins)", async ({ request }) => {
		const res = await request.get("/fr", {
			headers: { cookie: "flare.locale=hr", "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(200);
		expect(await res.text()).toContain("Bienvenue");
		expect(getCookie(res.headers(), "flare.locale")).toBe("fr");
	});

	test("/hr/about + cookie=en → 200 Croatian about", async ({ request }) => {
		const res = await request.get("/hr/about", {
			headers: { cookie: "flare.locale=en", "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(200);
		expect(await res.text()).toContain("O nama");
	});
});

/* ── 4. Cookie updates (Set-Cookie header) ────────────────────────── */

test.describe("cookie updates", () => {
	test("/hr + cookie=en → Set-Cookie: hr", async ({ request }) => {
		const res = await request.get("/hr", {
			headers: { cookie: "flare.locale=en", "user-agent": BROWSER_UA },
		});
		expect(getCookie(res.headers(), "flare.locale")).toBe("hr");
	});

	test("/hr + cookie=hr → no Set-Cookie (already correct)", async ({ request }) => {
		const res = await request.get("/hr", {
			headers: { cookie: "flare.locale=hr", "user-agent": BROWSER_UA },
		});
		expect(res.headers()["set-cookie"]).toBeUndefined();
	});

	test("/fr + cookie=hr → Set-Cookie: fr", async ({ request }) => {
		const res = await request.get("/fr", {
			headers: { cookie: "flare.locale=hr", "user-agent": BROWSER_UA },
		});
		expect(getCookie(res.headers(), "flare.locale")).toBe("fr");
	});

	test("/ (no cookie) → Set-Cookie: en", async ({ request }) => {
		const res = await request.get("/", {
			headers: { "user-agent": BROWSER_UA },
		});
		expect(getCookie(res.headers(), "flare.locale")).toBe("en");
	});
});

/* ── 5. Default locale stripping (/en → /) ────────────────────────── */

test.describe("default locale stripping", () => {
	test("/en → 302 → / with Set-Cookie: en", async ({ request }) => {
		const res = await request.get("/en", {
			headers: { "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
		expect(new URL(res.headers()["location"]).pathname).toBe("/");
		expect(getCookie(res.headers(), "flare.locale")).toBe("en");
	});

	test("/en/about → 302 → /about with Set-Cookie: en", async ({ request }) => {
		const res = await request.get("/en/about", {
			headers: { "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
		expect(new URL(res.headers()["location"]).pathname).toBe("/about");
		expect(getCookie(res.headers(), "flare.locale")).toBe("en");
	});

	test("/en/about + cookie=fr → 302 → /about + resets cookie to en", async ({ request }) => {
		const res = await request.get("/en/about", {
			headers: { cookie: "flare.locale=fr", "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
		expect(getCookie(res.headers(), "flare.locale")).toBe("en");
	});

	test("/en followed by browser → renders English at /", async ({ page }) => {
		await page.goto("/en");
		expect(new URL(page.url()).pathname).toBe("/");
		await expect(page.getByTestId("welcome-title")).toHaveText("Welcome");
	});
});

/* ── 6. Case normalization ────────────────────────────────────────── */

test.describe("case normalization", () => {
	test("/HR → 302 → /hr with Set-Cookie: hr", async ({ request }) => {
		const res = await request.get("/HR", {
			headers: { "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
		expect(res.headers()["location"]).toContain("/hr");
		expect(getCookie(res.headers(), "flare.locale")).toBe("hr");
	});

	test("/FR/about → 302 → /fr/about", async ({ request }) => {
		const res = await request.get("/FR/about", {
			headers: { "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
		expect(res.headers()["location"]).toContain("/fr/about");
	});

	test("/EN → 302 → /en → 302 → / (double redirect: case + default strip)", async ({ request }) => {
		const res = await request.get("/EN", {
			headers: { "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
		expect(res.headers()["location"]).toContain("/en");
	});
});

/* ── 7. Unsupported locale-like segments ──────────────────────────── */

test.describe("unsupported locale-like segments", () => {
	test("/de → 302 → / (strip unsupported)", async ({ request }) => {
		const res = await request.get("/de", {
			headers: { "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
	});

	test("/de/about → 302 → /about", async ({ request }) => {
		const res = await request.get("/de/about", {
			headers: { "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
		expect(res.headers()["location"]).toContain("/about");
	});
});

/* ── 8. Skip paths ────────────────────────────────────────────────── */

test.describe("skip paths", () => {
	test("file extensions skipped — /assets/app.js no redirect", async ({ request }) => {
		const res = await request.get("/assets/app.js", {
			headers: { cookie: "flare.locale=fr", "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		/* Should not redirect to /fr/assets/app.js */
		expect(res.status()).not.toBe(302);
	});
});

/* ── 9. Prefetch must NOT set cookie ──────────────────────────────── */

test.describe("prefetch isolation", () => {
	test("prefetch /hr + cookie=en → no Set-Cookie", async ({ request }) => {
		const res = await request.get("/hr", {
			headers: { cookie: "flare.locale=en", "user-agent": BROWSER_UA, "x-d": "1", "x-p": "1" },
		});
		expect(res.headers()["set-cookie"] ?? "").not.toContain("flare.locale=");
	});

	test("prefetch /fr + cookie=en → no Set-Cookie", async ({ request }) => {
		const res = await request.get("/fr", {
			headers: { cookie: "flare.locale=en", "user-agent": BROWSER_UA, "x-d": "1", "x-p": "1" },
		});
		expect(res.headers()["set-cookie"] ?? "").not.toContain("flare.locale=");
	});

	test("prefetch / + cookie=fr → no Set-Cookie", async ({ request }) => {
		const res = await request.get("/", {
			headers: { cookie: "flare.locale=fr", "user-agent": BROWSER_UA, "x-d": "1", "x-p": "1" },
		});
		expect(res.headers()["set-cookie"] ?? "").not.toContain("flare.locale=");
	});

	test("non-prefetch NDJSON still sets cookie", async ({ request }) => {
		const res = await request.get("/hr", {
			headers: { cookie: "flare.locale=en", "user-agent": BROWSER_UA, "x-d": "1" },
		});
		expect(getCookie(res.headers(), "flare.locale")).toBe("hr");
	});
});

/* ── 10. NDJSON — no cookie redirect (SPA handles routing) ────────── */

test.describe("NDJSON — no cookie redirect", () => {
	test("NDJSON / + cookie=hr → 200 (not redirected)", async ({ request }) => {
		const res = await request.get("/", {
			headers: { cookie: "flare.locale=hr", "user-agent": BROWSER_UA, "x-d": "1" },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(200);
	});

	test("NDJSON /about + cookie=fr → 200 (not redirected)", async ({ request }) => {
		const res = await request.get("/about", {
			headers: { cookie: "flare.locale=fr", "user-agent": BROWSER_UA, "x-d": "1" },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(200);
	});

	test("NDJSON /hr + cookie=en → 200 with Set-Cookie: hr", async ({ request }) => {
		const res = await request.get("/hr", {
			headers: { cookie: "flare.locale=en", "user-agent": BROWSER_UA, "x-d": "1" },
		});
		expect(res.status()).toBe(200);
		expect(getCookie(res.headers(), "flare.locale")).toBe("hr");
	});
});

/* ── 11. Browser: hard refresh preserves cookie after prefetches ──── */

test.describe("browser hard refresh — cookie survives prefetches", () => {
	test("/fr hard refresh → cookie stays fr after all prefetches", async ({ page }) => {
		await page.goto("/fr", { waitUntil: "networkidle" });
		await page.waitForTimeout(2000);
		const cookies = await page.context().cookies();
		const lc = cookies.find((c) => c.name === "flare.locale");
		expect(lc?.value).toBe("fr");
	});

	test("/hr hard refresh → cookie stays hr after all prefetches", async ({ page }) => {
		await page.goto("/hr", { waitUntil: "networkidle" });
		await page.waitForTimeout(2000);
		const cookies = await page.context().cookies();
		const lc = cookies.find((c) => c.name === "flare.locale");
		expect(lc?.value).toBe("hr");
	});

	test("/ hard refresh → cookie stays en after all prefetches", async ({ page }) => {
		await page.goto("/", { waitUntil: "networkidle" });
		await page.waitForTimeout(2000);
		const cookies = await page.context().cookies();
		const lc = cookies.find((c) => c.name === "flare.locale");
		expect(lc?.value).toBe("en");
	});
});

/* ── 12. Browser: cookie-respect redirect works in real browser ───── */

test.describe("browser cookie-respect redirect", () => {
	test("visit /fr → cookie=fr → navigate to / → redirected to /fr", async ({ page }) => {
		await page.goto("/fr");
		await expect(page.getByTestId("welcome-title")).toHaveText("Bienvenue");

		/* Now navigate to / — should redirect to /fr */
		await page.goto("/");
		await expect(page.getByTestId("welcome-title")).toHaveText("Bienvenue");
		expect(page.url()).toContain("/fr");
	});

	test("visit /hr → cookie=hr → navigate to / → redirected to /hr", async ({ page }) => {
		await page.goto("/hr");
		await expect(page.getByTestId("welcome-title")).toHaveText("Dobrodosli");

		await page.goto("/");
		await expect(page.getByTestId("welcome-title")).toHaveText("Dobrodosli");
		expect(page.url()).toContain("/hr");
	});

	test("visit /fr → navigate to /about → redirected to /fr/about", async ({ page }) => {
		await page.goto("/fr");
		await expect(page.getByTestId("welcome-title")).toHaveText("Bienvenue");

		await page.goto("/about");
		await expect(page.getByTestId("about-title")).toHaveText("A propos");
		expect(page.url()).toContain("/fr/about");
	});

	test("/en resets cookie → / stays English after", async ({ page }) => {
		/* First set cookie to fr */
		await page.goto("/fr");
		let cookies = await page.context().cookies();
		expect(cookies.find((c) => c.name === "flare.locale")?.value).toBe("fr");

		/* Now explicit /en → redirected to / with cookie=en */
		await page.goto("/en");
		cookies = await page.context().cookies();
		expect(cookies.find((c) => c.name === "flare.locale")?.value).toBe("en");
		expect(page.url()).not.toContain("/en");
		expect(page.url()).not.toContain("/fr");

		/* / should now stay English (cookie=en) */
		await page.goto("/");
		await expect(page.getByTestId("welcome-title")).toHaveText("Welcome");
	});
});

/* ── 13. SPA locale switcher ──────────────────────────────────────── */

test.describe("SPA locale switcher", () => {
	test("en → click hr → Croatian", async ({ page }) => {
		await gotoHydrated(page, "/");
		await expect(page.getByTestId("welcome-title")).toHaveText("Welcome");
		await page.getByTestId("switch-hr").click();
		await expect(page.getByTestId("welcome-title")).toHaveText("Dobrodosli");
		expect(page.url()).toContain("/hr");
	});

	test("en → click fr → French", async ({ page }) => {
		await gotoHydrated(page, "/");
		await page.getByTestId("switch-fr").click();
		await expect(page.getByTestId("welcome-title")).toHaveText("Bienvenue");
		expect(page.url()).toContain("/fr");
	});

	test("hr → click en → English at /", async ({ page }) => {
		await gotoHydrated(page, "/hr");
		await expect(page.getByTestId("welcome-title")).toHaveText("Dobrodosli");
		await page.getByTestId("switch-en").click();
		await expect(page.getByTestId("welcome-title")).toHaveText("Welcome");
		expect(page.url()).not.toContain("/hr");
	});

	test("fr → click hr → Croatian", async ({ page }) => {
		await gotoHydrated(page, "/fr");
		await page.getByTestId("switch-hr").click();
		await expect(page.getByTestId("welcome-title")).toHaveText("Dobrodosli");
		expect(page.url()).toContain("/hr");
	});

	test("full cycle: en → hr → fr → en", async ({ page }) => {
		await gotoHydrated(page, "/");
		await expect(page.getByTestId("welcome-title")).toHaveText("Welcome");

		await page.getByTestId("switch-hr").click();
		await expect(page.getByTestId("welcome-title")).toHaveText("Dobrodosli");

		await page.getByTestId("switch-fr").click();
		await expect(page.getByTestId("welcome-title")).toHaveText("Bienvenue");

		await page.getByTestId("switch-en").click();
		await expect(page.getByTestId("welcome-title")).toHaveText("Welcome");
	});
});

/* ── 14. SPA nav updates cookie ───────────────────────────────────── */

test.describe("SPA nav updates browser cookie", () => {
	test("click hr → cookie becomes hr", async ({ page }) => {
		await gotoHydrated(page, "/");
		await page.getByTestId("switch-hr").click();
		await expect(page.getByTestId("welcome-title")).toHaveText("Dobrodosli");
		await page.waitForTimeout(500);
		const cookies = await page.context().cookies();
		expect(cookies.find((c) => c.name === "flare.locale")?.value).toBe("hr");
	});

	test("click fr → cookie becomes fr", async ({ page }) => {
		await gotoHydrated(page, "/");
		await page.getByTestId("switch-fr").click();
		await expect(page.getByTestId("welcome-title")).toHaveText("Bienvenue");
		await page.waitForTimeout(500);
		const cookies = await page.context().cookies();
		expect(cookies.find((c) => c.name === "flare.locale")?.value).toBe("fr");
	});

	test("hr → click en → cookie becomes en", async ({ page }) => {
		await gotoHydrated(page, "/hr");
		await page.getByTestId("switch-en").click();
		await expect(page.getByTestId("welcome-title")).toHaveText("Welcome");
		await page.waitForTimeout(500);
		const cookies = await page.context().cookies();
		expect(cookies.find((c) => c.name === "flare.locale")?.value).toBe("en");
	});
});

/* ── 15. Hard nav after SPA switch ────────────────────────────────── */

test.describe("hard nav after SPA switch", () => {
	test("SPA switch to hr → reload → still Croatian", async ({ page }) => {
		await gotoHydrated(page, "/");
		await page.getByTestId("switch-hr").click();
		await expect(page.getByTestId("welcome-title")).toHaveText("Dobrodosli");
		await page.reload();
		await expect(page.getByTestId("welcome-title")).toHaveText("Dobrodosli");
		expect(page.url()).toContain("/hr");
	});

	test("SPA switch to fr → navigate / → redirected to /fr (cookie persists)", async ({ page }) => {
		await gotoHydrated(page, "/");
		await page.getByTestId("switch-fr").click();
		await expect(page.getByTestId("welcome-title")).toHaveText("Bienvenue");
		await page.goto("/");
		await expect(page.getByTestId("welcome-title")).toHaveText("Bienvenue");
		expect(page.url()).toContain("/fr");
	});

	test("SPA en → hr → hard nav /fr → French (explicit URL)", async ({ page }) => {
		await gotoHydrated(page, "/");
		await page.getByTestId("switch-hr").click();
		await expect(page.getByTestId("welcome-title")).toHaveText("Dobrodosli");
		await page.goto("/fr");
		await expect(page.getByTestId("welcome-title")).toHaveText("Bienvenue");
	});
});

/* ── 16. Cookie edge cases ────────────────────────────────────────── */

test.describe("cookie edge cases", () => {
	test("cookie=HR (uppercase) → recognized as hr, redirects", async ({ request }) => {
		const res = await request.get("/", {
			headers: { cookie: "flare.locale=HR", "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
		expect(res.headers()["location"]).toContain("/hr");
	});

	test("multiple cookies — flare.locale parsed correctly", async ({ request }) => {
		const res = await request.get("/", {
			headers: { cookie: "other=xyz; flare.locale=hr; session=abc", "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
		expect(res.headers()["location"]).toContain("/hr");
	});

	test("empty cookie value → no redirect, serves default", async ({ request }) => {
		const res = await request.get("/", {
			headers: { cookie: "flare.locale=", "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(200);
	});

	test("unsupported locale in cookie → no redirect", async ({ request }) => {
		const res = await request.get("/", {
			headers: { cookie: "flare.locale=zz", "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(200);
	});

	test("no cookie → 200, sets cookie=en", async ({ request }) => {
		const res = await request.get("/", {
			headers: { "user-agent": BROWSER_UA },
		});
		expect(getCookie(res.headers(), "flare.locale")).toBe("en");
	});
});

/* ── 17. Cookie attributes ────────────────────────────────────────── */

test.describe("cookie attributes", () => {
	test("Set-Cookie has Path=/ and SameSite=Lax", async ({ request }) => {
		const res = await request.get("/hr", {
			headers: { "user-agent": BROWSER_UA },
		});
		const raw = res.headers()["set-cookie"];
		expect(raw).toContain("Path=/");
		expect(raw).toContain("SameSite=Lax");
		expect(raw).toContain("Max-Age=31536000");
	});
});

/* ── 18. html lang attribute ──────────────────────────────────────── */

test.describe("html lang attribute", () => {
	test("/ → lang=en", async ({ page }) => {
		await page.goto("/");
		expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
	});

	test("/hr → lang=hr", async ({ page }) => {
		await page.goto("/hr");
		expect(await page.evaluate(() => document.documentElement.lang)).toBe("hr");
	});

	test("/fr → lang=fr", async ({ page }) => {
		await page.goto("/fr");
		expect(await page.evaluate(() => document.documentElement.lang)).toBe("fr");
	});

	test("SPA switch updates html lang", async ({ page }) => {
		await gotoHydrated(page, "/");
		expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
		await page.getByTestId("switch-hr").click();
		await expect(page.getByTestId("welcome-title")).toHaveText("Dobrodosli");
		expect(await page.evaluate(() => document.documentElement.lang)).toBe("hr");
	});
});

/* ── 19. Page titles per locale ───────────────────────────────────── */

test.describe("page titles", () => {
	test("/ → title 'Flare Real World'", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveTitle("Flare Real World");
	});

	test("/about → title 'About'", async ({ page }) => {
		await page.goto("/about");
		await expect(page).toHaveTitle("About");
	});

	test("/hr/about → title 'O nama'", async ({ page }) => {
		await page.goto("/hr/about");
		await expect(page).toHaveTitle("O nama");
	});

	test("/fr/about → title 'A propos'", async ({ page }) => {
		await page.goto("/fr/about");
		await expect(page).toHaveTitle("A propos");
	});
});

/* ── 20. Translation content ─────────────────────────────────────── */

test.describe("translation content", () => {
	test("English interpolation: Hello Flare", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByTestId("welcome-greeting")).toHaveText("Hello Flare");
	});

	test("Croatian interpolation: Bok Flare", async ({ page }) => {
		await page.goto("/hr");
		await expect(page.getByTestId("welcome-greeting")).toHaveText("Bok Flare");
	});

	test("French interpolation: Bonjour Flare", async ({ page }) => {
		await page.goto("/fr");
		await expect(page.getByTestId("welcome-greeting")).toHaveText("Bonjour Flare");
	});

	test("English plural: 3 items", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByTestId("welcome-items")).toHaveText("3 items");
	});

	test("Croatian plural: 3 stavki", async ({ page }) => {
		await page.goto("/hr");
		await expect(page.getByTestId("welcome-items")).toHaveText("3 stavki");
	});

	test("French plural: 3 elements", async ({ page }) => {
		await page.goto("/fr");
		await expect(page.getByTestId("welcome-items")).toHaveText("3 elements");
	});
});

/* ── 21. Repeated hard refresh — cookie consistent ────────────────── */

test.describe("repeated hard refresh", () => {
	test("/ + cookie=fr → redirects to /fr consistently (5x)", async ({ request }) => {
		for (let i = 0; i < 5; i++) {
			const res = await request.get("/", {
				headers: { cookie: "flare.locale=fr", "user-agent": BROWSER_UA },
				maxRedirects: 0,
			});
			expect(res.status()).toBe(302);
			expect(res.headers()["location"]).toContain("/fr");
		}
	});

	test("/hr consistent (5x)", async ({ request }) => {
		let cookie = "flare.locale=en";
		for (let i = 0; i < 5; i++) {
			const res = await request.get("/hr", {
				headers: { cookie, "user-agent": BROWSER_UA },
				maxRedirects: 0,
			});
			expect(res.status()).toBe(200);
			const sc = getCookie(res.headers(), "flare.locale");
			if (sc) {
				expect(sc).toBe("hr");
				cookie = `flare.locale=${sc}`;
			}
		}
	});
});

/* ── 22. Query string preserved across redirect ───────────────────── */

test.describe("query strings preserved", () => {
	test("/en/about?foo=bar → 302 → /about?foo=bar", async ({ request }) => {
		const res = await request.get("/en/about?foo=bar", {
			headers: { "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
		const loc = new URL(res.headers()["location"]);
		expect(loc.pathname).toBe("/about");
		expect(loc.searchParams.get("foo")).toBe("bar");
	});

	test("/ + cookie=fr + ?ref=x → 302 → /fr/?ref=x", async ({ request }) => {
		const res = await request.get("/?ref=x", {
			headers: { cookie: "flare.locale=fr", "user-agent": BROWSER_UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
		const loc = new URL(res.headers()["location"]);
		expect(loc.pathname).toContain("/fr");
		expect(loc.searchParams.get("ref")).toBe("x");
	});
});

/* ── 23. Human sets cookie via devtools ────────────────────────────── */

test.describe("manual cookie via devtools", () => {
	test("set cookie=hr → hard nav / → redirected to /hr", async ({ page }) => {
		await page.goto("/");
		await page.evaluate(() => {
			document.cookie = "flare.locale=hr; path=/";
		});
		await page.goto("/");
		await expect(page.getByTestId("welcome-title")).toHaveText("Dobrodosli");
		expect(page.url()).toContain("/hr");
	});

	test("set cookie=fr → hard nav /hr → Croatian (explicit URL wins)", async ({ page }) => {
		await page.goto("/hr");
		await page.evaluate(() => {
			document.cookie = "flare.locale=fr; path=/";
		});
		await page.goto("/hr");
		await expect(page.getByTestId("welcome-title")).toHaveText("Dobrodosli");
	});

	test("set bogus cookie → no crash", async ({ page }) => {
		await page.goto("/");
		await page.evaluate(() => {
			document.cookie = "flare.locale=zzzzzz; path=/";
		});
		await page.goto("/");
		await expect(page.getByTestId("welcome-title")).toHaveText("Welcome");
	});

	test("delete cookie → serves default", async ({ page }) => {
		await page.goto("/");
		await page.evaluate(() => {
			document.cookie = "flare.locale=; path=/; max-age=0";
		});
		await page.goto("/");
		await expect(page.getByTestId("welcome-title")).toHaveText("Welcome");
	});
});

/* ── 24. Fresh context per locale ─────────────────────────────────── */

test.describe("fresh browser context per locale", () => {
	test("/fr in fresh context → cookie=fr (not polluted by other tests)", async ({ browser, baseURL }) => {
		const ctx = await browser.newContext({ baseURL });
		const page = await ctx.newPage();
		await page.goto("/fr", { waitUntil: "networkidle" });
		await page.waitForTimeout(2000);
		const cookies = await ctx.cookies();
		expect(cookies.find((c) => c.name === "flare.locale")?.value).toBe("fr");
		await ctx.close();
	});

	test("/hr in fresh context → cookie=hr", async ({ browser, baseURL }) => {
		const ctx = await browser.newContext({ baseURL });
		const page = await ctx.newPage();
		await page.goto("/hr", { waitUntil: "networkidle" });
		await page.waitForTimeout(2000);
		const cookies = await ctx.cookies();
		expect(cookies.find((c) => c.name === "flare.locale")?.value).toBe("hr");
		await ctx.close();
	});

	test("/ in fresh context → cookie=en", async ({ browser, baseURL }) => {
		const ctx = await browser.newContext({ baseURL });
		const page = await ctx.newPage();
		await page.goto("/", { waitUntil: "networkidle" });
		await page.waitForTimeout(2000);
		const cookies = await ctx.cookies();
		expect(cookies.find((c) => c.name === "flare.locale")?.value).toBe("en");
		await ctx.close();
	});
});

/* ── 25. Full browser cycle across hard navs ──────────────────────── */

test.describe("full browser cycle", () => {
	test("/fr → / → /hr → /about → correct content and cookies at each step", async ({ page }) => {
		/* Step 1: /fr → French */
		await page.goto("/fr");
		await expect(page.getByTestId("welcome-title")).toHaveText("Bienvenue");
		let cookies = await page.context().cookies();
		expect(cookies.find((c) => c.name === "flare.locale")?.value).toBe("fr");

		/* Step 2: / → redirected to /fr (cookie=fr respected) */
		await page.goto("/");
		await expect(page.getByTestId("welcome-title")).toHaveText("Bienvenue");
		expect(page.url()).toContain("/fr");

		/* Step 3: /hr → Croatian, cookie updated */
		await page.goto("/hr");
		await expect(page.getByTestId("welcome-title")).toHaveText("Dobrodosli");
		cookies = await page.context().cookies();
		expect(cookies.find((c) => c.name === "flare.locale")?.value).toBe("hr");

		/* Step 4: /about → redirected to /hr/about (cookie=hr respected) */
		await page.goto("/about");
		await expect(page.getByTestId("about-title")).toHaveText("O nama");
		expect(page.url()).toContain("/hr/about");
	});
});

/* ── 26. No console errors ────────────────────────────────────────── */

test.describe("no console errors", () => {
	test("/ → no errors", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});
		await page.goto("/");
		await expect(page.getByTestId("welcome-title")).toHaveText("Welcome");
		expect(errors.filter((e) => !e.includes("favicon"))).toHaveLength(0);
	});

	test("/fr → no errors", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});
		await page.goto("/fr");
		await expect(page.getByTestId("welcome-title")).toHaveText("Bienvenue");
		expect(errors.filter((e) => !e.includes("favicon"))).toHaveLength(0);
	});

	test("SPA switch → no errors", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});
		await gotoHydrated(page, "/");
		await page.getByTestId("switch-hr").click();
		await expect(page.getByTestId("welcome-title")).toHaveText("Dobrodosli");
		await page.getByTestId("switch-fr").click();
		await expect(page.getByTestId("welcome-title")).toHaveText("Bienvenue");
		expect(errors.filter((e) => !e.includes("favicon"))).toHaveLength(0);
	});
});

/* ── 27. Navigation links respect locale ──────────────────────────── */

test.describe("nav links", () => {
	test("English: nav-about goes to /about", async ({ page }) => {
		await gotoHydrated(page, "/");
		await page.getByTestId("nav-about").click();
		await expect(page.getByTestId("about-title")).toHaveText("About");
		expect(page.url()).toContain("/about");
		expect(page.url()).not.toContain("/en");
	});

	test("Croatian: nav-about goes to /hr/about", async ({ page }) => {
		await gotoHydrated(page, "/hr");
		await page.getByTestId("nav-about").click();
		await expect(page.getByTestId("about-title")).toHaveText("O nama");
		expect(page.url()).toContain("/hr/about");
	});

	test("French: nav-about goes to /fr/about", async ({ page }) => {
		await gotoHydrated(page, "/fr");
		await page.getByTestId("nav-about").click();
		await expect(page.getByTestId("about-title")).toHaveText("A propos");
		expect(page.url()).toContain("/fr/about");
	});

	test("nav-home from /hr/about → /hr", async ({ page }) => {
		await gotoHydrated(page, "/hr/about");
		await page.getByTestId("nav-home").click();
		await expect(page.getByTestId("welcome-title")).toHaveText("Dobrodosli");
		expect(page.url()).toContain("/hr");
	});
});
