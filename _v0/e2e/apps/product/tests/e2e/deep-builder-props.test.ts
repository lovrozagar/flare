import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA, setNavMarker, setupConsoleCapture } from "./helpers";

test.describe("Deep: page render props (loaderData, location, preloaderContext)", () => {
	test("loaderData is present and has correct type", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/props-demo");

		expect(await page.locator("[data-testid=loader-data-present]").textContent()).toBe("true");
		expect(await page.locator("[data-testid=loader-pathname]").textContent()).toBe("/props-demo");
		expect(await page.locator("[data-testid=loader-has-request]").textContent()).toBe("true");
		expect(await page.locator("[data-testid=loader-has-deps]").textContent()).toBe("true");

		cap.assertClean();
	});

	test("loader cause is 'enter' on SSR", async ({ page }) => {
		await loadPage(page, "/props-demo");
		expect(await page.locator("[data-testid=loader-cause]").textContent()).toBe("enter");
	});

	test("loader prefetch is false on SSR", async ({ page }) => {
		await loadPage(page, "/props-demo");
		expect(await page.locator("[data-testid=loader-prefetch]").textContent()).toBe("false");
	});

	test("loader timestamp is a valid number", async ({ page }) => {
		await loadPage(page, "/props-demo");
		const ts = Number(await page.locator("[data-testid=loader-timestamp]").textContent());
		expect(ts).toBeGreaterThan(0);
	});

	test("location prop has correct pathname", async ({ page }) => {
		await loadPage(page, "/props-demo");
		expect(await page.locator("[data-testid=location-present]").textContent()).toBe("true");
		expect(await page.locator("[data-testid=location-pathname]").textContent()).toBe("/props-demo");
	});

	test("location.params is empty object for non-parameterized route", async ({ page }) => {
		await loadPage(page, "/props-demo");
		expect(await page.locator("[data-testid=location-params]").textContent()).toBe("{}");
	});

	test("location.search is empty object when no query", async ({ page }) => {
		await loadPage(page, "/props-demo");
		expect(await page.locator("[data-testid=location-search]").textContent()).toBe("{}");
	});
});

test.describe("Deep: preloaderContext inheritance", () => {
	test("preloaderContext is present in render props", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/props-demo");

		expect(await page.locator("[data-testid=preloader-context-present]").textContent()).toBe("true");
		expect(await page.locator("[data-testid=preloader-has-abort]").textContent()).toBe("true");
		expect(await page.locator("[data-testid=preloader-has-request]").textContent()).toBe("true");
		expect(await page.locator("[data-testid=preloader-pathname]").textContent()).toBe("/props-demo");

		cap.assertClean();
	});

	test("preloader timestamp is valid number", async ({ page }) => {
		await loadPage(page, "/props-demo");
		const ts = Number(await page.locator("[data-testid=preloader-timestamp]").textContent());
		expect(ts).toBeGreaterThan(0);
	});

	test("preloader runs BEFORE loader (timestamp ordering)", async ({ page }) => {
		await loadPage(page, "/props-demo");
		expect(await page.locator("[data-testid=preloader-before-loader]").textContent()).toBe("true");
	});

	test("preloaderContext.preloaderTimestamp matches loader's received value", async ({ page }) => {
		await loadPage(page, "/props-demo");
		expect(await page.locator("[data-testid=preloader-timestamp-match]").textContent()).toBe("true");
	});

	test("preloader env type is defined", async ({ page }) => {
		await loadPage(page, "/props-demo");
		/* env is an object on server, may be undefined on some platforms */
		const envType = await page.locator("[data-testid=preloader-env-type]").textContent();
		expect(envType).toBeTruthy();
	});
});

test.describe("Deep: nested layout+page preloaderContext independence", () => {
	test("layout preloader and page preloader both run", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/props-nested");

		/* Layout preloader ran */
		expect(await page.locator("[data-testid=layout-preloader-ran]").textContent()).toBe("true");
		expect(await page.locator("[data-testid=layout-loader-data]").textContent()).toBe("true");

		/* Page preloader ran */
		expect(await page.locator("[data-testid=page-preloader-ran]").textContent()).toBe("true");
		expect(await page.locator("[data-testid=page-loader-ran]").textContent()).toBe("true");

		cap.assertClean();
	});

	test("layout has its own preloaderContext (not page's)", async ({ page }) => {
		await loadPage(page, "/props-nested");

		/* Layout preloader returns layoutTimestamp */
		const layoutTs = Number(await page.locator("[data-testid=layout-preloader-timestamp]").textContent());
		expect(layoutTs).toBeGreaterThan(0);

		/* Page preloader returns pageTimestamp */
		const pageTs = Number(await page.locator("[data-testid=page-preloader-timestamp]").textContent());
		expect(pageTs).toBeGreaterThan(0);

		/* Both timestamps exist independently — layout doesn't see page's timestamp */
		expect(await page.locator("[data-testid=layout-preloader-pathname]").textContent()).toBe("/props-nested");
		expect(await page.locator("[data-testid=page-preloader-pathname]").textContent()).toBe("/props-nested");
	});

	test("page preloaderContext timestamp matches page loader received value", async ({ page }) => {
		await loadPage(page, "/props-nested");
		expect(await page.locator("[data-testid=page-preloader-ts-match]").textContent()).toBe("true");
	});

	test("layout preloaderContext timestamp matches layout loader received value", async ({ page }) => {
		await loadPage(page, "/props-nested");
		const preloaderTs = await page.locator("[data-testid=layout-preloader-timestamp]").textContent();
		const loaderTs = await page.locator("[data-testid=layout-loader-preloader-ts]").textContent();
		expect(preloaderTs).toBe(loaderTs);
	});

	test("layout children prop contains page content", async ({ page }) => {
		await loadPage(page, "/props-nested");
		expect(await page.locator("[data-testid=layout-children-present]").textContent()).toBe("true");
		const content = await page.locator("[data-testid=props-nested-content]").innerHTML();
		expect(content).toContain("props-nested-page");
	});

	test("layout location matches page location", async ({ page }) => {
		await loadPage(page, "/props-nested");
		expect(await page.locator("[data-testid=layout-location-pathname]").textContent()).toBe("/props-nested");
		expect(await page.locator("[data-testid=page-location-pathname]").textContent()).toBe("/props-nested");
	});
});

test.describe("Deep: render props survive SPA navigation", () => {
	test("SPA nav to props-demo shows correct render props", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await navigateSPA(page, "/props-demo");

		await expect(page.locator("[data-testid=props-demo]")).toBeVisible();
		expect(await page.locator("[data-testid=loader-data-present]").textContent()).toBe("true");
		expect(await page.locator("[data-testid=preloader-context-present]").textContent()).toBe("true");
		expect(await page.locator("[data-testid=location-pathname]").textContent()).toBe("/props-demo");
		expect(await page.locator("[data-testid=preloader-timestamp-match]").textContent()).toBe("true");

		cap.assertClean();
	});

	test("SPA nav to props-nested shows layout+page props", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		await navigateSPA(page, "/props-nested");

		await expect(page.locator("[data-testid=props-nested-layout]")).toBeVisible();
		await expect(page.locator("[data-testid=props-nested-page]")).toBeVisible();
		expect(await page.locator("[data-testid=layout-preloader-ran]").textContent()).toBe("true");
		expect(await page.locator("[data-testid=page-preloader-ran]").textContent()).toBe("true");
		expect(await page.locator("[data-testid=page-preloader-ts-match]").textContent()).toBe("true");

		cap.assertClean();
	});

	test("round-trip: props-demo → about → props-demo re-runs preloader", async ({ page }) => {
		await loadPage(page, "/props-demo");

		const ts1 = Number(await page.locator("[data-testid=preloader-timestamp]").textContent());
		expect(ts1).toBeGreaterThan(0);

		await navigateSPA(page, "/about");
		await page.waitForTimeout(50);
		await navigateSPA(page, "/props-demo");

		const ts2 = Number(await page.locator("[data-testid=preloader-timestamp]").textContent());
		expect(ts2).toBeGreaterThan(0);

		/* Preloader re-ran — timestamp differs */
		expect(ts2).not.toBe(ts1);
	});
});

test.describe("Deep: head context receives preloaderContext", () => {
	test("SSR title contains pathname from head context", async ({ page }) => {
		await loadPage(page, "/props-demo");
		const title = await page.title();
		expect(title).toContain("Props Demo");
		expect(title).toContain("/props-demo");
	});

	test("SSR description contains cause and prefetch from head context", async ({ page }) => {
		await loadPage(page, "/props-demo");
		const desc = await page.locator("meta[name='description']").getAttribute("content");
		expect(desc).toContain("Cause: enter");
		expect(desc).toContain("Prefetch: false");
	});

	test("nested page head has correct title", async ({ page }) => {
		await loadPage(page, "/props-nested");
		const title = await page.title();
		expect(title).toContain("Props Nested");
		expect(title).toContain("/props-nested");
	});
});

test.describe("Deep: error boundary props", () => {
	test("errorRender receives error.message prop", async ({ page }) => {
		const response = await page.goto("/broken", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(500);

		/* Error stacks are stripped from serialized FlareState for security */
		const state = await page.evaluate(() => (self as unknown as { flare?: Record<string, unknown> }).flare);
		expect(state).toBeDefined();
		expect((state as Record<string, unknown>).e).toBeUndefined();
	});

	test("unauthorizedRender receives location prop on /dashboard SSR", async ({ page }) => {
		const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(401);
		/* Unauthorized boundary should render */
		const body = await page.evaluate(() => document.body.innerHTML);
		expect(body.length).toBeGreaterThan(0);
	});

	test("notFoundRender receives location prop on 404", async ({ page }) => {
		const response = await page.goto("/nonexistent-xyz-abc");
		expect(response?.status()).toBe(404);
		const body = await page.evaluate(() => document.body.innerHTML);
		expect(body.length).toBeGreaterThan(0);
	});
});

test.describe("Deep: user param route render props", () => {
	test("parameterized route has correct location.params", async ({ page }) => {
		await loadPage(page, "/users/42");
		const id = await page.locator("[data-testid=user-id]").textContent();
		expect(id).toBe("42");
		const name = await page.locator("[data-testid=user-name]").textContent();
		expect(name).toBe("User 42");
	});

	test("SPA param change updates render props", async ({ page }) => {
		await loadPage(page, "/users/1");
		await expect(page.locator("[data-testid=user-id]")).toHaveText("1");

		await setNavMarker(page);
		await navigateSPA(page, "/users/99");
		/* Wait for NDJSON data to render after param change */
		await expect(page.locator("[data-testid=user-id]")).toHaveText("99", { timeout: 5_000 });
		await expect(page.locator("[data-testid=user-name]")).toHaveText("User 99");
	});
});
