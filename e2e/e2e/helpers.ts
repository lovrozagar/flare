import { expect, type Page } from "@playwright/test"

/**
 * Known benign patterns filtered from console errors and page errors.
 * AbortError: WebKit surfaces unhandled rejections for fetch cancellation
 * during SPA navigation and view transition overlap — Chromium swallows these.
 */
const IGNORE_PATTERNS = [
	/computations created outside/i,
	/owner.*cleanup/i,
	/SSL certificate error.*fetching the script/i,
	/^AbortError/,
]

/**
 * Core validation gate.
 * EVERY test that loads a page must go through this.
 * Asserts: data-hydrated present, FlareState valid, no console errors/page errors.
 */
export async function assertHydrated(page: Page): Promise<void> {
	await page.waitForFunction(() => document.documentElement.hasAttribute("data-hydrated"), null, {
		timeout: 15_000,
	})
	const hasAttr = await page.evaluate(() => document.documentElement.hasAttribute("data-hydrated"))
	expect(hasAttr).toBe(true)
}

/**
 * Validate FlareState shape embedded in HTML.
 */
export async function assertFlareState(page: Page): Promise<void> {
	const state = await page.evaluate(() => (self as unknown as { flare?: unknown }).flare)
	expect(state).not.toBeNull()
	expect(state).not.toBeUndefined()
	const obj = state as Record<string, unknown>
	expect(typeof obj.p).toBe("string")
	expect(typeof obj.r).toBe("object")
	expect(obj.r).not.toBeNull()
	expect(typeof obj.c).toBe("object")
	expect(obj.c).not.toBeNull()
	expect(Array.isArray(obj.m)).toBe(true)
	expect((obj.m as unknown[]).length).toBeGreaterThan(0)
}

/**
 * Full page load: goto + assert hydration + assert FlareState + assert no hydration warnings.
 * This is the standard way to load a page in tests — replaces createTestPage+load.
 */
export async function loadPage(page: Page, path: string): Promise<void> {
	const hydrationWarnings: string[] = []
	const captureHandler = (msg: { text: () => string }) => {
		const text = msg.text()
		if (text.toLowerCase().includes("hydration") || text.toLowerCase().includes("mismatch")) {
			hydrationWarnings.push(text)
		}
	}
	page.on("console", captureHandler)

	await page.goto(path, { waitUntil: "domcontentloaded" })
	await assertHydrated(page)
	await assertFlareState(page)

	page.removeListener("console", captureHandler)
	if (hydrationWarnings.length > 0) {
		throw new Error(`Hydration mismatch detected on ${path}:\n${hydrationWarnings.join("\n")}`)
	}
}

/**
 * Set a marker on window to detect full page reloads.
 * A full reload destroys the JS context, so the marker disappears.
 */
export async function setNavMarker(page: Page): Promise<void> {
	await page.evaluate(() => {
		;(window as unknown as Record<string, unknown>).__FLARE_NAV_MARKER__ = Date.now()
	})
	/* verify marker was set */
	const set = await page.evaluate(
		() => typeof (window as unknown as Record<string, unknown>).__FLARE_NAV_MARKER__ === "number",
	)
	expect(set).toBe(true)
}

/**
 * Assert that navigation was SPA (no full reload).
 * Checks: marker survives, data-hydrated survives.
 */
export async function assertSPANavigation(page: Page): Promise<void> {
	const markerSurvived = await page.evaluate(
		() => typeof (window as unknown as Record<string, unknown>).__FLARE_NAV_MARKER__ === "number",
	)
	if (!markerSurvived) {
		throw new Error(
			"FULL PAGE RELOAD DETECTED: window.__FLARE_NAV_MARKER__ was destroyed. " +
				"Navigation did a native HTML reload instead of SPA client-side navigation. " +
				`Current URL: ${page.url()}`,
		)
	}

	const hydrated = await page.evaluate(() => document.documentElement.hasAttribute("data-hydrated"))
	if (!hydrated) {
		throw new Error(
			"data-hydrated attribute missing after navigation. " +
				"Hydration was lost — likely a full page reload occurred.",
		)
	}
}

/**
 * Click a link, wait for URL change, and assert it was SPA navigation.
 * This is the standard way to navigate in tests.
 */
export async function clickAndAssertSPA(
	page: Page,
	selector: string,
	expectedPath: string,
): Promise<void> {
	/* ensure page is hydrated before clicking (WebKit may reload on goBack) */
	await assertHydrated(page)
	await setNavMarker(page)
	await page.click(selector)
	await page.waitForURL(`**${expectedPath}`, { timeout: 10_000 })
	await assertSPANavigation(page)
}

/**
 * Assert no unexpected console errors.
 * Filters known Solid dev warnings.
 */
export function setupConsoleCapture(page: Page): {
	assertClean: () => void
	errors: string[]
	pageErrors: string[]
} {
	const errors: string[] = []
	const pageErrors: string[] = []

	page.on("console", (msg) => {
		if (msg.type() === "error") {
			const text = msg.text()
			const isIgnored = IGNORE_PATTERNS.some((p) => p.test(text))
			if (!isIgnored) {
				errors.push(text)
			}
		}
	})

	page.on("pageerror", (error) => {
		const isIgnored =
			IGNORE_PATTERNS.some((p) => p.test(error.message)) ||
			IGNORE_PATTERNS.some((p) => p.test(error.name))
		if (!isIgnored) {
			pageErrors.push(error.message)
		}
	})

	return {
		assertClean: () => {
			if (errors.length > 0) {
				throw new Error(`Unexpected console errors:\n${errors.join("\n")}`)
			}
			if (pageErrors.length > 0) {
				throw new Error(`Unexpected page errors:\n${pageErrors.join("\n")}`)
			}
		},
		errors,
		pageErrors,
	}
}

/**
 * Trigger SPA navigation via Flare's navigate() exposed on window.
 * Use this instead of raw <a> clicks for programmatic SPA nav in tests.
 */
export async function navigateSPA(page: Page, to: string): Promise<void> {
	await setNavMarker(page)
	await page.evaluate((path) => {
		const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
			| ((to: string) => Promise<void>)
			| undefined
		if (!nav) throw new Error("__flareNavigate not available — hydration may have failed")
		return nav(path)
	}, to)
	await page.waitForURL(`**${to}`, { timeout: 10_000 })
	await assertSPANavigation(page)
}

export const BASE = "https://localhost:3999"
