import { expect, type Page, test } from "@playwright/test";
import { assertSPANavigation, loadPage, setNavMarker, setupConsoleCapture } from "./helpers";

/*
 * A page from an older deploy (an open tab, or HTML a CDN still caches) navigating against the
 * live server. The only thing faked is the first document's build id in its SSR state; the
 * server's build check, the t:"b" frame and the client's recovery are all real.
 */

/** The first document boots as build "old-build"; later documents keep the server's id. */
async function bootFirstDocumentAsOldBuild(page: Page): Promise<void> {
	await page.addInitScript(() => {
		if (sessionStorage.getItem("__skew_test_done")) return;
		sessionStorage.setItem("__skew_test_done", "1");
		let state: unknown;
		Object.defineProperty(self, "flare", {
			configurable: true,
			get: () => state,
			set: (value: { b?: string } | undefined) => {
				if (value && typeof value === "object" && "b" in value) value.b = "old-build";
				state = value;
			},
		});
	});
}

/* After a full document load, cross-document view transitions pause rAF in headless Chromium,
   so wait with interval polling instead of the rAF-based default. */
async function waitHydrated(page: Page): Promise<void> {
	await page.waitForFunction(() => document.documentElement.hasAttribute("data-flare-hydrated"), null, {
		polling: 50,
		timeout: 15_000,
	});
}

function pageBuild(page: Page): Promise<string | undefined> {
	return page.evaluate(() => (self as unknown as { flare?: { b?: string } }).flare?.b);
}

test.describe("build skew", () => {
	test("same build: client navigation stays SPA and data URLs carry the build id", async ({ page }) => {
		const console = setupConsoleCapture(page);
		const dataUrls: string[] = [];
		page.on("request", (req) => {
			if (req.headers()["flare-data"] === "1") dataUrls.push(req.url());
		});

		await loadPage(page, "/a11y-nav-test");
		const build = await pageBuild(page);
		await setNavMarker(page);
		await page.getByTestId("nav-about").click();
		await expect(page.getByTestId("about-heading")).toBeVisible();

		await assertSPANavigation(page);
		expect(build).toBeTruthy();
		expect(dataUrls.some((u) => new URL(u).searchParams.get("_flare") === build)).toBe(true);
		console.assertClean();
	});

	test("old build: navigation becomes a full document load of the target, never a foreign render", async ({ page }) => {
		const console = setupConsoleCapture(page);
		const frames: string[] = [];
		await page.route("**/*_flare=old-build*", async (route) => {
			const response = await route.fetch();
			const body = await response.text();
			frames.push(body);
			await route.fulfill({ body, response });
		});
		await bootFirstDocumentAsOldBuild(page);

		await loadPage(page, "/a11y-nav-test");
		expect(await pageBuild(page)).toBe("old-build");
		await setNavMarker(page);
		await page.getByTestId("nav-about").click();
		await page.waitForURL("**/about");
		await page.waitForLoadState("load");
		await waitHydrated(page);
		await expect(page.getByTestId("about-heading")).toBeVisible();

		/* Fresh document (marker gone) on the live build, reached via the server's t:"b" answer. */
		expect(await page.evaluate(() => typeof (window as unknown as Record<string, unknown>).__FLARE_NAV_MARKER__)).toBe(
			"undefined",
		);
		const live = await pageBuild(page);
		expect(live).toBeTruthy();
		expect(live).not.toBe("old-build");
		expect(frames.some((f) => f.includes('"t":"b"'))).toBe(true);
		console.assertClean();
	});
});
