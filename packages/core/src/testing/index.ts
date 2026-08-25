import { EMPTY_ARR } from "../internal/index.ts";
import { ATTR_HYDRATED } from "../protocol.ts";

const HYDRATION_PATTERNS = [/hydration/i, /mismatch/i, /unable to find dom nodes/i];

export function isHydrationError(message: string): boolean {
	return HYDRATION_PATTERNS.some((p) => p.test(message));
}

export function filterByPatterns(messages: string[], patterns: readonly RegExp[]): string[] {
	if (patterns.length === 0) return messages;
	return messages.filter((msg) => !patterns.some((p) => p.test(msg)));
}

export function assertFlareStateShape(state: unknown): void {
	if (state === null || state === undefined || typeof state !== "object") {
		throw new Error("FlareState is null or not an object");
	}

	const obj = state as Record<string, unknown>;

	if (typeof obj.p !== "string") {
		throw new Error("FlareState.p (pathname) must be a string");
	}

	if (typeof obj.r !== "object" || obj.r === null) {
		throw new Error("FlareState.r (params) must be an object");
	}

	if (typeof obj.c !== "object" || obj.c === null) {
		throw new Error("FlareState.c (context) must be an object");
	}
}

/* ── FlarePage ───────────────────────────────────────────────────────── */

export interface ConsoleMessage {
	text: string;
	type: "error" | "log" | "warning";
}

export interface PageError {
	message: string;
	stack?: string;
}

/**
 * Minimal page interface matching Playwright's Page.
 * Avoids hard dependency on @playwright/test.
 */
export interface FlarePageInterface {
	evaluate: (fn: unknown) => Promise<unknown>;
	getByText: (text: string) => { click: () => Promise<void> };
	goto: (url: string, options?: { waitUntil?: string }) => Promise<unknown>;
	locator: (selector: string) => unknown;
	on: (event: string, handler: (...args: unknown[]) => void) => void;
	url: () => string;
	waitForFunction: (
		fn: string | ((arg: unknown) => boolean),
		arg?: unknown,
		options?: { timeout?: number },
	) => Promise<void>;
	waitForLoadState: (state?: string) => Promise<void>;
	waitForSelector: (selector: string, options?: { timeout?: number }) => Promise<void>;
}

export class FlarePage {
	readonly page: FlarePageInterface;
	private captures: {
		consoleErrors: string[];
		consoleLogs: string[];
		consoleWarnings: string[];
		pageErrors: PageError[];
	} = {
		consoleErrors: [],
		consoleLogs: [],
		consoleWarnings: [],
		pageErrors: [],
	};
	private capturing = false;
	private lastResponse: unknown = null;

	constructor(page: FlarePageInterface) {
		this.page = page;
	}

	/* ── Lifecycle ──────────────────────────────────────────────────── */

	startCapturing(): void {
		if (this.capturing) return;
		this.capturing = true;

		this.page.on("console", (...args: unknown[]) => {
			const msg = args[0] as { text: () => string; type: () => string };
			const text = msg.text();
			const type = msg.type();
			if (type === "error") this.captures.consoleErrors.push(text);
			else if (type === "warning") this.captures.consoleWarnings.push(text);
			else this.captures.consoleLogs.push(text);
		});

		this.page.on("pageerror", (...args: unknown[]) => {
			const error = args[0] as { message: string; stack?: string };
			this.captures.pageErrors.push({
				message: error.message,
				stack: error.stack,
			});
		});
	}

	clearCaptures(): void {
		this.captures.consoleErrors = [];
		this.captures.consoleLogs = [];
		this.captures.consoleWarnings = [];
		this.captures.pageErrors = [];
	}

	/* ── Navigation ─────────────────────────────────────────────────── */

	async goto(path = "/"): Promise<unknown> {
		this.lastResponse = await this.page.goto(path, { waitUntil: "domcontentloaded" });
		await this.page.waitForSelector("body", { timeout: 15_000 });
		return this.lastResponse;
	}

	async load(path: string): Promise<unknown> {
		const response = await this.goto(path);
		await this.waitForHydration();
		await this.page.waitForLoadState("networkidle");
		return response;
	}

	async waitForNavigation(path: string): Promise<void> {
		await this.page.waitForFunction((expected: unknown) => window.location.pathname === expected, path, {
			timeout: 15_000,
		});
	}

	async clickLink(text: string): Promise<void> {
		await this.page.getByText(text).click();
	}

	async navigateNdjson(linkText: string): Promise<void> {
		await this.setNavigationMarker();
		await this.clickLink(linkText);
		await this.page.waitForLoadState("networkidle");
	}

	/* ── Hydration ──────────────────────────────────────────────────── */

	async waitForHydration(timeout = 15_000): Promise<void> {
		await this.page.waitForFunction(
			`document.documentElement.hasAttribute(${JSON.stringify(ATTR_HYDRATED)})`,
			undefined,
			{
				timeout,
			},
		);
	}

	/* ── State ──────────────────────────────────────────────────────── */

	async getFlareState(): Promise<unknown> {
		return await this.page.evaluate(() => (self as unknown as { flare?: unknown }).flare ?? null);
	}

	async assertFlareStateValid(): Promise<void> {
		const state = await this.getFlareState();
		assertFlareStateShape(state);
	}

	/* ── CSR detection ──────────────────────────────────────────────── */

	async setNavigationMarker(): Promise<void> {
		await this.page.evaluate("window.__FLARE_NAV_MARKER__ = true");
	}

	async wasClientNavigation(): Promise<boolean> {
		const result = await this.page.evaluate("Boolean(window.__FLARE_NAV_MARKER__)");
		return result as boolean;
	}

	/* ── Response ───────────────────────────────────────────────────── */

	getLastResponse(): unknown {
		return this.lastResponse;
	}

	/* ── Captures ───────────────────────────────────────────────────── */

	getConsoleLogs(): string[] {
		return [...this.captures.consoleLogs];
	}

	getConsoleErrors(): string[] {
		return [...this.captures.consoleErrors];
	}

	getConsoleWarnings(): string[] {
		return [...this.captures.consoleWarnings];
	}

	getPageErrors(): PageError[] {
		return [...this.captures.pageErrors];
	}

	getHydrationErrors(): string[] {
		const all = [...this.captures.consoleErrors, ...this.captures.pageErrors.map((e) => e.message)];
		return all.filter((msg) => isHydrationError(msg));
	}

	hasHydrationErrors(): boolean {
		return this.getHydrationErrors().length > 0;
	}

	/* ── Assertions ─────────────────────────────────────────────────── */

	assertNoConsoleErrors(ignorePatterns: readonly RegExp[] = EMPTY_ARR): void {
		const errors = filterByPatterns(this.captures.consoleErrors, ignorePatterns);
		if (errors.length > 0) {
			throw new Error(`Test failed: ${errors.length} console error(s): ${errors.join(", ")}`);
		}
	}

	assertNoConsoleWarnings(ignorePatterns: readonly RegExp[] = EMPTY_ARR): void {
		const warnings = filterByPatterns(this.captures.consoleWarnings, ignorePatterns);
		if (warnings.length > 0) {
			throw new Error(`Test failed: ${warnings.length} console warning(s): ${warnings.join(", ")}`);
		}
	}

	assertNoPageErrors(): void {
		if (this.captures.pageErrors.length > 0) {
			const msgs = this.captures.pageErrors.map((e) => e.message);
			throw new Error(`Test failed: ${msgs.length} page error(s): ${msgs.join(", ")}`);
		}
	}

	assertNoHydrationErrors(): void {
		const hydrationErrors = this.getHydrationErrors();
		if (hydrationErrors.length > 0) {
			throw new Error(`Test failed: ${hydrationErrors.length} hydration error(s): ${hydrationErrors.join(", ")}`);
		}
	}

	assertHealthy(): void {
		this.assertNoHydrationErrors();
		this.assertNoPageErrors();
		this.assertNoConsoleErrors();
	}

	assertFullyHealthy(): void {
		this.assertHealthy();
		this.assertNoConsoleWarnings();
	}
}
