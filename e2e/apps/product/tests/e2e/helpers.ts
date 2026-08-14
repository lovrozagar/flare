import { expect, type Page } from "@playwright/test"

/**
 * Shared Playwright helpers for the product app.
 * Keep this file small — add a helper only when a new test needs it twice.
 */

const IGNORE_PATTERNS = [
	/computations created outside/i,
	/owner.*cleanup/i,
	/^AbortError/,
]

export async function assertHydrated(page: Page): Promise<void> {
	await page.waitForFunction(() => document.documentElement.hasAttribute("data-hydrated"), null, {
		timeout: 15_000,
	})
	const hasAttr = await page.evaluate(() => document.documentElement.hasAttribute("data-hydrated"))
	expect(hasAttr).toBe(true)
}

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

/** Solid mismatch copy — not a module URL that happens to contain `/hydration/`. */
function isHydrationMismatchConsole(text: string): boolean {
	const lower = text.toLowerCase()
	if (/\/hydration\//.test(lower) || /hydration\/index\./.test(lower)) return false
	return /\bhydration\b/.test(lower) || lower.includes("mismatch")
}

export async function loadPage(page: Page, path: string): Promise<void> {
	const hydrationWarnings: string[] = []
	const captureHandler = (msg: { text: () => string }) => {
		const text = msg.text()
		if (isHydrationMismatchConsole(text)) {
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

export async function setNavMarker(page: Page): Promise<void> {
	await page.evaluate(() => {
		;(window as unknown as Record<string, unknown>).__FLARE_NAV_MARKER__ = Date.now()
	})
	const set = await page.evaluate(
		() => typeof (window as unknown as Record<string, unknown>).__FLARE_NAV_MARKER__ === "number",
	)
	expect(set).toBe(true)
}

export async function assertSPANavigation(page: Page): Promise<void> {
	const markerSurvived = await page.evaluate(
		() => typeof (window as unknown as Record<string, unknown>).__FLARE_NAV_MARKER__ === "number",
	)
	if (!markerSurvived) {
		throw new Error(
			"FULL PAGE RELOAD DETECTED: window.__FLARE_NAV_MARKER__ was destroyed. " +
				`Current URL: ${page.url()}`,
		)
	}

	const hydrated = await page.evaluate(() => document.documentElement.hasAttribute("data-hydrated"))
	if (!hydrated) {
		throw new Error("data-hydrated attribute missing after navigation.")
	}
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
	await assertSPANavigation(page)
}

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
			if (!IGNORE_PATTERNS.some((p) => p.test(text))) {
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
	const target = new URL(to, "http://navigate.local")
	await page.waitForURL(
		(url) => {
			if (url.pathname !== target.pathname) return false
			if (!target.search) return true
			return url.search === target.search
		},
		{ timeout: 10_000 },
	)
	await assertSPANavigation(page)
}

/** Playwright baseURL is already set; some tests concatenate BASE onto paths. */
export const BASE = ""

export function parseNDJSON(body: string): Array<Record<string, unknown>> {
	return body
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => JSON.parse(l) as Record<string, unknown>)
}
