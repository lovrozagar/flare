/**
 * Flare Playwright E2E Test Utilities
 *
 * Page object pattern for E2E tests with Flare applications.
 * Captures console errors, warnings, and page errors for verification.
 */

import { test as base, expect, type Locator, type Page, type Response } from "@playwright/test"

interface ConsoleMessage {
	type: "error" | "warning" | "log"
	text: string
}

interface PageError {
	message: string
	stack?: string
}

interface FlareState {
	r: { pathname: string; params: Record<string, unknown>; matches: unknown[] }
	q: unknown[]
	c: { routerDefaults?: Record<string, unknown> }
}

/**
 * Flare page object for E2E testing.
 * Provides utilities for navigation, state inspection, and error detection.
 */
class FlarePage {
	readonly page: Page
	readonly body: Locator
	readonly flareStateScript: Locator

	private consoleMessages: ConsoleMessage[] = []
	private pageErrors: PageError[] = []
	private listening = false
	private lastResponse: Response | null = null

	constructor(page: Page) {
		this.page = page
		this.body = page.locator("body")
		this.flareStateScript = page.locator("script:has-text('self.flare')")
	}

	/**
	 * Start listening for console messages and page errors.
	 */
	startCapturing(): void {
		if (this.listening) return
		this.listening = true
		this.consoleMessages = []
		this.pageErrors = []

		this.page.on("console", (msg) => {
			const type = msg.type()
			if (type === "error" || type === "warning" || type === "log") {
				this.consoleMessages.push({
					text: msg.text(),
					type: type as "error" | "warning" | "log",
				})
			}
		})

		this.page.on("pageerror", (error) => {
			this.pageErrors.push({
				message: error.message,
				stack: error.stack,
			})
		})
	}

	/**
	 * Clear captured messages
	 */
	clearCaptures(): void {
		this.consoleMessages = []
		this.pageErrors = []
	}

	/**
	 * Navigate to a path and wait for body to be attached
	 */
	async goto(path: string = "/"): Promise<Response | null> {
		this.startCapturing()
		this.lastResponse = await this.page.goto(path)
		await this.body.waitFor({ state: "attached", timeout: 15000 })
		return this.lastResponse
	}

	/**
	 * Navigate and wait for full load (hydration + networkidle)
	 */
	async load(path: string): Promise<Response | null> {
		const response = await this.goto(path)
		await this.waitForHydration()
		await this.page.waitForLoadState("networkidle")
		return response
	}

	/**
	 * Wait for hydration to complete
	 */
	async waitForHydration(timeout: number = 10000): Promise<void> {
		await this.page.waitForFunction(
			() => (window as unknown as { __FLARE_HYDRATED__?: boolean }).__FLARE_HYDRATED__ === true,
			{ timeout },
		)
	}

	/**
	 * Get the FlareState object from the browser (self.flare)
	 */
	getFlareState(): Promise<FlareState | null> {
		return this.page.evaluate(() => {
			return (window as unknown as { flare: FlareState | null }).flare
		})
	}

	/**
	 * Assert self.flare state is valid
	 */
	async assertFlareStateValid(): Promise<void> {
		const state = await this.getFlareState()
		if (!state) {
			throw new Error("self.flare is not defined")
		}
		if (!state.r || typeof state.r.pathname !== "string") {
			throw new Error("self.flare.r (route state) is invalid")
		}
		if (!Array.isArray(state.q)) {
			throw new Error("self.flare.q (query cache) is not an array")
		}
		if (!state.c) {
			throw new Error("self.flare.c (context) is invalid")
		}
	}

	/**
	 * Wait for navigation to complete to a specific path
	 */
	async waitForNavigation(path: string): Promise<void> {
		await this.page.waitForURL(`**${path}`)
	}

	/**
	 * Click a link by its text content (exact match)
	 */
	async clickLink(text: string): Promise<void> {
		await this.page.getByRole("link", { exact: true, name: text }).click()
	}

	/**
	 * Navigate via NDJSON (click default link)
	 */
	async navigateNdjson(linkText: string): Promise<void> {
		await this.setNavigationMarker()
		await this.clickLink(linkText)
		await this.page.waitForLoadState("networkidle")
	}

	/**
	 * Navigate via HTML (click navFormat="html" link)
	 */
	async navigateHtml(selector: string): Promise<void> {
		await this.setNavigationMarker()
		await this.page.click(selector)
		await this.page.waitForLoadState("networkidle")
	}

	/**
	 * Set marker for CSR detection (survives client nav, cleared on hard nav)
	 */
	async setNavigationMarker(): Promise<void> {
		await this.page.evaluate(() => {
			;(window as unknown as Record<string, boolean>).__FLARE_NAV_MARKER__ = true
		})
	}

	/**
	 * Check if last nav was CSR (marker survived)
	 */
	wasClientNavigation(): Promise<boolean> {
		return this.page.evaluate(
			() => (window as unknown as Record<string, boolean>).__FLARE_NAV_MARKER__ === true,
		)
	}

	/**
	 * Get response headers from last navigation
	 */
	getResponseHeaders(): Record<string, string> {
		if (!this.lastResponse) return {}
		return this.lastResponse.headers()
	}

	/**
	 * Get last response
	 */
	getLastResponse(): Response | null {
		return this.lastResponse
	}

	/**
	 * Get all captured console logs
	 */
	getConsoleLogs(): string[] {
		return this.consoleMessages.filter((m) => m.type === "log").map((m) => m.text)
	}

	/**
	 * Get all captured console errors
	 */
	getConsoleErrors(): string[] {
		return this.consoleMessages.filter((m) => m.type === "error").map((m) => m.text)
	}

	/**
	 * Get all captured console warnings
	 */
	getConsoleWarnings(): string[] {
		return this.consoleMessages.filter((m) => m.type === "warning").map((m) => m.text)
	}

	/**
	 * Get all captured page errors
	 */
	getPageErrors(): PageError[] {
		return this.pageErrors
	}

	/**
	 * Check if any hydration errors were captured
	 */
	hasHydrationErrors(): boolean {
		const allErrors = [...this.getConsoleErrors(), ...this.pageErrors.map((e) => e.message)]
		return allErrors.some(
			(e) =>
				e.toLowerCase().includes("hydration") ||
				e.toLowerCase().includes("mismatch") ||
				e.includes("Unable to find DOM nodes"),
		)
	}

	/**
	 * Get hydration error details
	 */
	getHydrationErrors(): string[] {
		const allErrors = [...this.getConsoleErrors(), ...this.pageErrors.map((e) => e.message)]
		return allErrors.filter(
			(e) =>
				e.toLowerCase().includes("hydration") ||
				e.toLowerCase().includes("mismatch") ||
				e.includes("Unable to find DOM nodes"),
		)
	}

	/**
	 * Assert no console errors
	 */
	assertNoConsoleErrors(ignorePatterns: RegExp[] = []): void {
		const errors = this.getConsoleErrors().filter((e) => !ignorePatterns.some((p) => p.test(e)))
		if (errors.length > 0) {
			throw new Error(`Unexpected console errors:\n${errors.join("\n")}`)
		}
	}

	/**
	 * Assert no console warnings
	 */
	assertNoConsoleWarnings(ignorePatterns: RegExp[] = []): void {
		const warnings = this.getConsoleWarnings().filter((w) => !ignorePatterns.some((p) => p.test(w)))
		if (warnings.length > 0) {
			throw new Error(`Unexpected console warnings:\n${warnings.join("\n")}`)
		}
	}

	/**
	 * Assert no page errors
	 */
	assertNoPageErrors(): void {
		if (this.pageErrors.length > 0) {
			throw new Error(
				`Unexpected page errors:\n${this.pageErrors.map((e) => e.message).join("\n")}`,
			)
		}
	}

	/**
	 * Assert no hydration errors
	 */
	assertNoHydrationErrors(): void {
		const hydrationErrors = this.getHydrationErrors()
		if (hydrationErrors.length > 0) {
			const logs = this.getConsoleLogs()
			const logSection = logs.length > 0 ? `\n\nConsole logs:\n${logs.join("\n")}` : ""
			throw new Error(`Hydration errors detected:\n${hydrationErrors.join("\n")}${logSection}`)
		}
	}

	/**
	 * Assert page is healthy - no errors of any kind
	 */
	assertHealthy(): void {
		this.assertNoHydrationErrors()
		this.assertNoPageErrors()
		this.assertNoConsoleErrors()
	}

	/**
	 * Assert page is fully healthy including warnings
	 */
	assertFullyHealthy(): void {
		this.assertHealthy()
		this.assertNoConsoleWarnings()
	}
}

/**
 * Extended Playwright test with Flare fixture
 */
const test = base.extend<{ flare: FlarePage }>({
	flare: async ({ page }, use) => {
		const flarePage = new FlarePage(page)
		flarePage.startCapturing()
		await use(flarePage)
	},
})

export type { ConsoleMessage, FlareState, PageError }

export { expect, FlarePage, test }
