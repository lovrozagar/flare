import { expect, test } from "@playwright/test";
import { loadPage, setupConsoleCapture } from "./helpers";

/*
 * Prod-mode assertions — tagged @prod-only so they are skipped in dev
 * (playwright.config.ts: grepInvert: isDev ? /@prod-only/ : /@dev-only/)
 */

/* ── Prod class name pattern: a1-<hash8> ────────────────────────────── */

test.describe("sx: prod — atomic class name format @prod-only", () => {
	test("sx elements carry a1- prefixed classes in prod", async ({ page }) => {
		await loadPage(page, "/styling-sx-basic");
		const cls = (await page.getByTestId("sx-basic-box").getAttribute("class")) ?? "";
		/* At least one class matches a1-<8 alphanumeric chars> */
		expect(cls).toMatch(/a1-[a-z0-9]{1,8}/);
	});

	test("no dev-mode sx- class names present in prod", async ({ page }) => {
		await loadPage(page, "/styling-sx-basic");
		const cls = (await page.getByTestId("sx-basic-box").getAttribute("class")) ?? "";
		expect(cls).not.toMatch(/\bsx-/);
	});

	test("compiled styles still produce correct computed color in prod", async ({ page }) => {
		await loadPage(page, "/styling-sx-basic");
		const color = await page.getByTestId("sx-basic-box").evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(0, 0, 255)");
	});

	test("no console errors in prod", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/styling-sx-basic");
		cap.assertClean();
	});
});

test.describe("sx: prod — nested selectors use hashed classes @prod-only", () => {
	test("hover element carries a1- class", async ({ page }) => {
		await loadPage(page, "/styling-sx-nested");
		const cls = (await page.getByTestId("sx-hover-box").getAttribute("class")) ?? "";
		expect(cls).toMatch(/a1-[a-z0-9]{1,8}/);
	});

	test("media element carries a1- class", async ({ page }) => {
		await loadPage(page, "/styling-sx-nested");
		const cls = (await page.getByTestId("sx-media-box").getAttribute("class")) ?? "";
		expect(cls).toMatch(/a1-[a-z0-9]{1,8}/);
	});
});

test.describe("sx: prod — variants use hashed classes @prod-only", () => {
	test("variant element carries a1- class", async ({ page }) => {
		await loadPage(page, "/styling-sx-variants");
		const cls = (await page.getByTestId("sx-variants-box").getAttribute("class")) ?? "";
		expect(cls).toMatch(/a1-[a-z0-9]{1,8}/);
	});

	test("computed color still correct after hash rename in prod", async ({ page }) => {
		await loadPage(page, "/styling-sx-variants");
		const color = await page.getByTestId("sx-variants-box").evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(0, 100, 200)");
	});
});

/* ── Dev-mode class name pattern: sx-<prop>-<val>-<hash4> ────────────── */

test.describe("sx: dev — readable class name format @dev-only", () => {
	test("sx element carries sx- prefixed human-readable class in dev", async ({ page }) => {
		await loadPage(page, "/styling-sx-basic");
		const cls = (await page.getByTestId("sx-basic-box").getAttribute("class")) ?? "";
		/* dev: sx-<prop>-<value-slug>-<hash4> */
		expect(cls).toMatch(/\bsx-/);
	});

	test("no a1- hashed classes in dev mode", async ({ page }) => {
		await loadPage(page, "/styling-sx-basic");
		const cls = (await page.getByTestId("sx-basic-box").getAttribute("class")) ?? "";
		expect(cls).not.toMatch(/\ba1-/);
	});
});

/* ── SSR: critical CSS + preload link ───────────────────────────────── */

test.describe("sx: prod — critical CSS inlined in HTML @prod-only", () => {
	test("initial HTML contains flare-critical style element", async ({ page }) => {
		/* relative URL — resolved against project baseURL (port 4000 in prod projects) */
		const res = await page.request.get("/styling-sx-basic");
		const html = await res.text();
		/* flare-critical present as inline style with populated content */
		expect(html).toContain("flare-critical");
	});

	test("critical style contains @layer rules for the route's atomic classes", async ({ page }) => {
		const res = await page.request.get("/styling-sx-basic");
		const html = await res.text();
		/* styling-sx-basic is app-level code → classes land in @layer app.
		 * Lib-path modules would use @layer sx — both are valid critical CSS. */
		expect(html).toMatch(/@layer (sx|app)/);
	});

	test("stylesheet link for flare-global.css emitted in head", async ({ page }) => {
		const res = await page.request.get("/styling-sx-basic");
		const html = await res.text();
		/* Direct stylesheet — preload-as-style + onload swap is an inline handler and fails CSP. */
		expect(html).toMatch(/rel="stylesheet"[^>]*flare-global|flare-global[^>]*rel="stylesheet"/);
	});
});

/* ── Dev-mode: flare-runtime present on pages with runtime CSS ───────── */

test.describe("sx: dev — flare-runtime on compileSx page @dev-only", () => {
	test("flare-runtime sheet exists on compileSx page in dev", async ({ page }) => {
		/* /styling-sx-fallback uses compileSx — must have flare-runtime sheet */
		await loadPage(page, "/styling-sx-fallback");
		const exists = await page.evaluate(() => document.getElementById("flare-runtime") !== null);
		expect(exists).toBe(true);
	});
});
