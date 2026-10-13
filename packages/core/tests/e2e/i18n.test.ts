import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { flarePage } from "../../src/testing/index.ts";
import { boot, type Boot } from "./boot.ts";

let session: Boot;

// Headless Chromium says "HeadlessChrome", which isbot counts as a bot, and a bot never follows the cookie or
// Accept-Language. These rows are about a visitor, so every page presents a desktop browser.
test.use({
	userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
});

test.beforeAll(async ({ browserName }, workerInfo) => {
	const name = workerInfo.project.name ?? `node-dev-${browserName}`;
	const [runtime, mode] = name.split("-");
	session = await boot({ app: "i18n", runtime: runtime ?? "node", mode: mode ?? "dev" });
});

test.afterAll(async () => {
	await session.close();
});

// A repeat document load of a URL uses a fresh page in the same context, so cookies and storage carry over. Firefox's
// driver otherwise counts the first document's boot-time history write as a navigation that never finishes, and
// every later wait on that page stalls.

// Console warnings that name hydration, beside the console errors flarePage collects.
function hydrationWarnings(page: Page): string[] {
	const warnings: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "warning" && /hydration/i.test(message.text())) warnings.push(message.text());
	});
	return warnings;
}

test("prefix", async ({ page }: { page: Page }) => {
	await flarePage(page).load(`${session.origin}/hr`);
	await expect(page.locator("#message")).toHaveText("Bok");
	await expect(page.locator("html")).toHaveAttribute("lang", "hr");
	await expect(page.locator("#locale")).toHaveText("hr");
});

test("shared cookie", async ({ page }: { page: Page }) => {
	const response = await page.goto(`${session.origin}/hr`);
	expect(response?.status()).toBe(200);
	expect(response?.headers()["cache-control"]).toMatch(/^public/);
	expect(await response?.headerValue("set-cookie")).toBeNull();
});

test("unknown locale", async ({ page }: { page: Page }) => {
	const response = await page.goto(`${session.origin}/fr`);
	const redirect = await response?.request().redirectedFrom()?.response();
	expect(redirect?.status()).toBe(302);
	expect(redirect?.headers()["cache-control"]).toContain("no-store");
	expect(new URL(page.url()).pathname).toBe("/");
	await expect(page.locator("#message")).toHaveText("Hello");
});

test("theme no flash", async ({ context }: { context: BrowserContext }) => {
	await context.addInitScript(() => localStorage.setItem("flare.theme", "dark"));
	// No external script loads, so only the inline script, before any module, can set the attribute.
	const painted = await context.newPage();
	await painted.route("**/*", (route) =>
		route.request().resourceType() === "script" ? route.abort() : route.continue(),
	);
	await painted.goto(`${session.origin}/`);
	expect(await painted.locator("html").getAttribute("data-theme")).toBe("dark");
	const page = await context.newPage();
	const helper = flarePage(page);
	const warnings = hydrationWarnings(page);
	await helper.load(`${session.origin}/`);
	await expect(page.locator("#theme")).toHaveText("dark");
	await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
	expect(helper.consoleErrors()).toEqual([]);
	expect(warnings).toEqual([]);
});

test("rtl client", async ({ page }: { page: Page }) => {
	await flarePage(page).load(`${session.origin}/`);
	await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
	await page.click("#ar");
	await expect(page).toHaveURL(`${session.origin}/ar`);
	await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
	await expect(page.locator("#dir")).toHaveText("rtl");
	await expect(page.locator("#message")).toHaveText("مرحبا");
});

// A promise in `page` that settles on its next `storage` event.
function nextStorageEvent(page: Page): Promise<void> {
	return page.evaluate(
		() => new Promise<void>((resolve) => addEventListener("storage", () => resolve(), { once: true })),
	);
}

test("tabs sync", async ({ context }: { context: BrowserContext }) => {
	const first = await context.newPage();
	const second = await context.newPage();
	await flarePage(first).load(`${session.origin}/`);
	await flarePage(second).load(`${session.origin}/`);
	// A storage write alone moves no tab: the providers listen on flare.sync, not on `storage`.
	const heard = nextStorageEvent(first);
	await second.evaluate(() => {
		localStorage.setItem("flare.theme", "dark");
		localStorage.setItem("flare.dir", "rtl");
	});
	await heard;
	for (const page of [first, second]) {
		await expect(page.locator("#theme")).toHaveText("system");
		await expect(page.locator("#dir")).toHaveText("ltr");
	}
	await first.click("#light");
	await expect(second.locator("#theme")).toHaveText("light");
	await expect(second.locator("html")).toHaveAttribute("data-theme", "light");
	await first.click("#rtl");
	await expect(second.locator("#dir")).toHaveText("rtl");
	await expect(second.locator("html")).toHaveAttribute("dir", "rtl");
	await first.click("#hr");
	await expect(first).toHaveURL(`${session.origin}/hr`);
	await expect(second).toHaveURL(`${session.origin}/hr`);
	await expect(second.locator("#locale")).toHaveText("hr");
	await expect(second.locator("#message")).toHaveText("Bok");
});

// The visitor's browser asks for hr. On a shared page they choose the default, and the cookie setLocale wrote keeps
// the next document load of a URL with no tag on the default instead of redirecting to /hr.
test("set locale persists", async ({ browser }: { browser: Browser }) => {
	const context = await browser.newContext({
		locale: "hr",
		userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
	});
	const page = await context.newPage();
	try {
		const negotiated = await page.goto(`${session.origin}/`);
		expect(new URL(page.url()).pathname).toBe("/hr");
		expect(negotiated?.request().redirectedFrom()).not.toBeNull();
		// Only setLocale's own write may carry the choice from here, not the cookie the negotiating redirect set.
		await context.clearCookies();
		await page.waitForSelector("html[data-flare-hydrated]", { state: "attached" });
		await page.click("#en");
		await expect(page).toHaveURL(`${session.origin}/`);
		await expect(page.locator("#message")).toHaveText("Hello");
		const next = await context.newPage();
		const response = await next.goto(`${session.origin}/`);
		expect(response?.request().redirectedFrom()).toBeNull();
		expect(new URL(next.url()).pathname).toBe("/");
		await expect(next.locator("#message")).toHaveText("Hello");
	} finally {
		await context.close();
	}
});
