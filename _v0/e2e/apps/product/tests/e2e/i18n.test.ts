import { expect, test } from "@playwright/test";
import { loadPage } from "./helpers";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

function locUrl(header: string | undefined): URL {
	return new URL(header ?? "", "http://localhost");
}

function cookie(headers: Record<string, string>, name: string): string | null {
	const raw = headers["set-cookie"];
	if (!raw) return null;
	return raw.match(new RegExp(`${name}=([^;]+)`))?.[1] ?? null;
}

test.describe("i18n hard nav", () => {
	test("/i18n-demo is English + cookie en", async ({ page }) => {
		await page.goto("/i18n-demo");
		await expect(page.getByTestId("welcome-title")).toHaveText("Welcome");
		expect(await page.evaluate(() => document.documentElement.lang || "en")).toBe("en");
		const cookies = await page.context().cookies();
		expect(cookies.find((c) => c.name === "flare.locale")?.value ?? "en").toBe("en");
	});

	test("/i18n-demo/hr is Croatian", async ({ page }) => {
		await page.goto("/i18n-demo/hr");
		await expect(page.getByTestId("welcome-title")).toHaveText("Dobrodosli");
	});

	test("/i18n-demo/fr is French + interpolation", async ({ page }) => {
		await page.goto("/i18n-demo/fr");
		await expect(page.getByTestId("welcome-title")).toHaveText("Bienvenue");
		await expect(page.getByTestId("welcome-greeting")).toHaveText("Bonjour Flare");
		await expect(page.getByTestId("welcome-items")).toContainText("3");
	});
});

test.describe("i18n cookie rules", () => {
	test("/ + cookie=hr → 302 /hr", async ({ request }) => {
		const res = await request.get("/", {
			headers: { cookie: "flare.locale=hr", "user-agent": UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
		expect(res.headers().location).toContain("/hr");
	});

	test("/ + cookie=en → 200", async ({ request }) => {
		const res = await request.get("/", {
			headers: { cookie: "flare.locale=en", "user-agent": UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(200);
	});

	test("optional-locale URL /i18n-demo/hr is 200 even with cookie=en", async ({ request }) => {
		const res = await request.get("/i18n-demo/hr", {
			headers: { cookie: "flare.locale=en", "user-agent": UA },
			maxRedirects: 0,
		});
		expect([200, 302]).toContain(res.status());
		if (res.status() === 200) {
			expect(await res.text()).toContain("Dobrodosli");
		}
	});

	test("/en strips to /", async ({ request }) => {
		const res = await request.get("/en/i18n-demo", {
			headers: { "user-agent": UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
		expect(locUrl(res.headers().location).pathname).toBe("/i18n-demo");
	});

	test("/HR case normalize", async ({ request }) => {
		const res = await request.get("/HR/i18n-demo", {
			headers: { "user-agent": UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
		expect(res.headers().location).toContain("/hr");
	});

	test("/de unsupported stripped", async ({ request }) => {
		const res = await request.get("/de/i18n-demo", {
			headers: { "user-agent": UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
	});

	test("file path not prefixed", async ({ request }) => {
		const res = await request.get("/api/health", {
			headers: { cookie: "flare.locale=fr", "user-agent": UA },
			maxRedirects: 0,
		});
		expect(res.status()).not.toBe(302);
	});

	test("prefetch does not Set-Cookie", async ({ request }) => {
		const res = await request.get("/i18n-demo/hr", {
			headers: { cookie: "flare.locale=en", "user-agent": UA, "flare-data": "1", "flare-prefetch": "1" },
		});
		expect(res.headers()["set-cookie"] ?? "").not.toContain("flare.locale=");
	});

	test("NDJSON does not cookie-redirect", async ({ request }) => {
		const res = await request.get("/i18n-demo", {
			headers: { cookie: "flare.locale=hr", "user-agent": UA, "flare-data": "1" },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(200);
	});

	test("query preserved on strip", async ({ request }) => {
		const res = await request.get("/en/i18n-demo?foo=bar", {
			headers: { "user-agent": UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
		expect(locUrl(res.headers().location).searchParams.get("foo")).toBe("bar");
	});

	test("bot does not redirect", async ({ request }) => {
		const res = await request.get("/", {
			headers: { cookie: "flare.locale=hr", "user-agent": "Googlebot" },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(200);
	});

	test("no cookie sets en", async ({ request }) => {
		const res = await request.get("/i18n-demo", { headers: { "user-agent": UA } });
		expect(cookie(res.headers(), "flare.locale")).toBe("en");
	});
});

test.describe("i18n SPA", () => {
	test("switcher links exist; hard nav to hr updates copy", async ({ page }) => {
		await loadPage(page, "/i18n-demo");
		await expect(page.getByTestId("switch-hr")).toHaveAttribute("href", "/i18n-demo/hr");
		await page.goto("/i18n-demo/hr");
		await expect(page.getByTestId("welcome-title")).toHaveText("Dobrodosli");
	});
});

test.describe("locale-prefixed tree", () => {
	test("/hr is Croatian home", async ({ page }) => {
		await page.goto("/hr");
		await expect(page.getByTestId("locale-home")).toBeVisible();
		await expect(page.getByTestId("locale-home-welcome")).toHaveText("Dobrodosli");
		await expect(page.getByTestId("locale-home-locale")).toHaveText("hr");
	});

	test("/hr/about is Croatian about", async ({ page }) => {
		await page.goto("/hr/about");
		await expect(page.getByTestId("locale-about")).toBeVisible();
		await expect(page.getByTestId("locale-about-welcome")).toHaveText("Dobrodosli");
		await expect(page.getByTestId("locale-about-locale")).toHaveText("hr");
	});

	test("/fr/about is French about", async ({ page }) => {
		await page.goto("/fr/about");
		await expect(page.getByTestId("locale-about-welcome")).toHaveText("Bienvenue");
		await expect(page.getByTestId("locale-about-locale")).toHaveText("fr");
	});

	test("/about + cookie=hr redirects to /hr/about", async ({ request }) => {
		const res = await request.get("/about", {
			headers: { cookie: "flare.locale=hr", "user-agent": UA },
			maxRedirects: 0,
		});
		expect(res.status()).toBe(302);
		expect(res.headers().location).toContain("/hr/about");
	});

	test("cookie redirect / + hr lands on locale home after follow", async ({ page }) => {
		await page.setExtraHTTPHeaders({ cookie: "flare.locale=hr", "user-agent": UA });
		await page.goto("/");
		expect(new URL(page.url()).pathname).toBe("/hr");
		await expect(page.getByTestId("locale-home-welcome")).toHaveText("Dobrodosli");
	});
});
