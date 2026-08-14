import { expect, type Page } from "@playwright/test"

const HYDRATE_TIMEOUT = process.env.BASE_URL ? 30_000 : 15_000

export async function assertHydrated(page: Page): Promise<void> {
	await page.waitForFunction(() => document.documentElement.hasAttribute("data-hydrated"), null, {
		timeout: HYDRATE_TIMEOUT,
	})
}

export async function loadPage(page: Page, path: string): Promise<void> {
	await page.goto(path, { waitUntil: "domcontentloaded" })
	try {
		await assertHydrated(page)
	} catch {
		/* Worker cold start can miss the first hydrate window. */
		await page.reload({ waitUntil: "domcontentloaded" })
		await assertHydrated(page)
	}
}

export async function setNavMarker(page: Page): Promise<void> {
	await page.evaluate(() => {
		;(window as unknown as Record<string, unknown>).__FLARE_NAV_MARKER__ = Date.now()
	})
}

export async function clickAndAssertSPA(
	page: Page,
	selector: string,
	expectedPath: string,
): Promise<void> {
	await assertHydrated(page)
	await setNavMarker(page)
	await page.click(selector)
	await page.waitForURL(`**${expectedPath}`, { timeout: 10_000 })
	const markerSurvived = await page.evaluate(
		() => typeof (window as unknown as Record<string, unknown>).__FLARE_NAV_MARKER__ === "number",
	)
	expect(markerSurvived).toBe(true)
}
