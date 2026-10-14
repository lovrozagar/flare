import type { Browser, BrowserContext, Page } from "@playwright/test";
import { flarePage } from "../../src/testing/index.ts";
import { deepOnly, DESKTOP_UA, expect, open, prodOnly, test } from "./docs.fixture.ts";

// Locale, theme, direction, cross-tab sync, image, fonts, head, SEO files, and CSS (bits/15 docs-features). The
// first seven cases are bit 13's i18n cases, moved here when the i18n app was retired (B94).
deepOnly();

// Headless Chromium says "HeadlessChrome", which isbot counts as a bot, and a bot never follows the cookie or
// Accept-Language. These rows are about a visitor.
test.use({ userAgent: DESKTOP_UA });

function hydrationWarnings(page: Page): string[] {
	const warnings: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "warning" && /hydration/i.test(message.text())) warnings.push(message.text());
	});
	return warnings;
}

test("prefix", async ({ page, docs }) => {
	await flarePage(page).load(`${docs.origin}/hr`);
	await expect(page.locator("#message")).toHaveText("Bok");
	await expect(page.locator("html")).toHaveAttribute("lang", "hr");
	await expect(page.locator("#locale")).toHaveText("hr");
});

test("shared cookie", async ({ page, docs }) => {
	const response = await page.goto(`${docs.origin}/hr`);
	expect(response?.status()).toBe(200);
	expect(response?.headers()["cache-control"]).toMatch(/^public/);
	expect(await response?.headerValue("set-cookie")).toBeNull();
});

test("unknown locale", async ({ page, docs }) => {
	const response = await page.goto(`${docs.origin}/fr`);
	const redirect = await response?.request().redirectedFrom()?.response();
	expect(redirect?.status()).toBe(302);
	expect(redirect?.headers()["cache-control"]).toContain("no-store");
	expect(new URL(page.url()).pathname).toBe("/");
	await expect(page.locator("#message")).toHaveText("Hello");
});

test("theme no flash", async ({ context, docs }: { context: BrowserContext; docs: { origin: string } }) => {
	await context.addInitScript(() => localStorage.setItem("flare.theme", "dark"));
	const painted = await context.newPage();
	await painted.route("**/*", (route) =>
		route.request().resourceType() === "script" ? route.abort() : route.continue(),
	);
	await painted.goto(`${docs.origin}/`);
	expect(await painted.locator("html").getAttribute("data-theme")).toBe("dark");
	const page = await context.newPage();
	const helper = flarePage(page);
	const warnings = hydrationWarnings(page);
	await helper.load(`${docs.origin}/`);
	await expect(page.locator("#theme")).toHaveText("dark");
	await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
	expect(helper.consoleErrors()).toEqual([]);
	expect(warnings).toEqual([]);
});

test("rtl client", async ({ page, docs }) => {
	await flarePage(page).load(`${docs.origin}/`);
	await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
	await page.click("#ar");
	await expect(page).toHaveURL(`${docs.origin}/ar`);
	await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
	await expect(page.locator("#dir")).toHaveText("rtl");
	await expect(page.locator("#message")).toHaveText("مرحبا");
});

// The listener is in place before this returns, so a write from another tab cannot fire its event first. The
// returned wait settles on that event.
async function nextStorageEvent(page: Page): Promise<() => Promise<void>> {
	await page.evaluate(() => {
		const heard = new Promise<void>((resolve) => addEventListener("storage", () => resolve(), { once: true }));
		Reflect.set(globalThis, "__docsStorageEvent", heard);
	});
	return async () => {
		await page.evaluate(() => Reflect.get(globalThis, "__docsStorageEvent"));
	};
}

test("tabs sync", async ({ context, docs }: { context: BrowserContext; docs: { origin: string } }) => {
	const first = await context.newPage();
	const second = await context.newPage();
	await flarePage(first).load(`${docs.origin}/`);
	await flarePage(second).load(`${docs.origin}/`);
	// A storage write alone moves no tab: the providers listen on flare.sync, not on `storage`.
	const heard = await nextStorageEvent(first);
	await second.evaluate(() => {
		localStorage.setItem("flare.theme", "dark");
		localStorage.setItem("flare.dir", "rtl");
	});
	await heard();
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
	await expect(first).toHaveURL(`${docs.origin}/hr`);
	await expect(second).toHaveURL(`${docs.origin}/hr`);
	await expect(second.locator("#locale")).toHaveText("hr");
	await expect(second.locator("#message")).toHaveText("Bok");
});

test("set locale persists", async ({ browser, docs }: { browser: Browser; docs: { origin: string } }) => {
	const context = await browser.newContext({ locale: "hr", userAgent: DESKTOP_UA });
	const page = await context.newPage();
	try {
		const negotiated = await page.goto(`${docs.origin}/`);
		expect(new URL(page.url()).pathname).toBe("/hr");
		expect(negotiated?.request().redirectedFrom()).not.toBeNull();
		await context.clearCookies();
		await page.waitForSelector("html[data-flare-hydrated]", { state: "attached" });
		await page.click("#en");
		await expect(page).toHaveURL(`${docs.origin}/`);
		await expect(page.locator("#message")).toHaveText("Hello");
		const next = await context.newPage();
		const response = await next.goto(`${docs.origin}/`);
		expect(response?.request().redirectedFrom()).toBeNull();
		await expect(next.locator("#message")).toHaveText("Hello");
	} finally {
		await context.close();
	}
});

test("theme system", async ({ page, docs, browserName }) => {
	// Playwright's Firefox ignores an emulated color scheme: matchMedia stays light, so the case cannot run there.
	test.skip(browserName === "firefox", "Firefox emulation ignores colorScheme");
	await page.emulateMedia({ colorScheme: "dark" });
	await open(page, docs.origin, "/docs/routing");
	await expect(page.locator("#theme")).toHaveText("system");
	await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
	// The `dark:` variant follows the attribute: the body is the ink background.
	await expect(page.locator("body")).toHaveCSS("background-color", "rgb(11, 11, 16)");
	await page.click("#light");
	await expect(page.locator("body")).toHaveCSS("background-color", "rgb(250, 250, 249)");
});

test("theme transition", async ({ page, docs }) => {
	await open(page, docs.origin, "/");
	await page.evaluate(() => {
		Reflect.set(window, "__transitionStyles", 0);
		new MutationObserver((records) => {
			for (const record of records)
				for (const node of record.addedNodes)
					if (node instanceof HTMLStyleElement && node.textContent?.includes("transition:none"))
						Reflect.set(window, "__transitionStyles", Number(Reflect.get(window, "__transitionStyles")) + 1);
		}).observe(document.head, { childList: true });
	});
	await page.click("#dark");
	await expect.poll(() => page.evaluate(() => Reflect.get(window, "__transitionStyles"))).toBe(1);
	await expect(page.locator('style:text-matches("transition:none")')).toHaveCount(0);
});

test("rtl layout", async ({ page, docs }) => {
	await open(page, docs.origin, "/ar/docs/routing");
	const sidebar = await page.locator("#sidebar").boundingBox();
	const article = await page.locator("#article").boundingBox();
	expect(sidebar !== null && article !== null && sidebar.x > article.x).toBe(true);
	await page.click("#dir-auto");
	await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
	await page.click("#ltr");
	await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

// An omitted locale inside LocaleProvider is the provider's tag. The plural category shows it on every CLDR version:
// Arabic's for 14 is `many`, English's `other`. The digits follow the runtime's CLDR, so they prove nothing (B29).
test("format message", async ({ page, docs }) => {
	await open(page, docs.origin, "/ar");
	await expect(page.locator("#release-count")).toHaveText("14 releases (many)");
	await open(page, docs.origin, "/");
	await expect(page.locator("#release-count")).toHaveText("14 releases");
});

test("image responsive", async ({ page, docs }) => {
	await open(page, docs.origin, "/");
	const hero = page.locator("section img").first();
	await expect(hero).toHaveAttribute("fetchpriority", "high");
	await expect(hero).toHaveAttribute("loading", "eager");
	const srcset = (await hero.getAttribute("srcset")) ?? "";
	expect(srcset.split(", ").map((entry) => entry.split(" ")[1])).toEqual(["480w", "960w", "1600w"]);
	await expect(hero).toHaveCSS("object-fit", "cover");
	await expect.poll(() => hero.evaluate((img) => (img as HTMLImageElement).complete)).toBe(true);
	await expect(hero).toHaveCSS("background-image", "none");
});

test("image fixed", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/routing");
	const figure = page.locator("#figure img");
	await expect(figure).toHaveAttribute("width", "480");
	await expect(figure).toHaveAttribute("height", "270");
	await expect(figure).toHaveAttribute("loading", "lazy");
	expect(await figure.getAttribute("srcset")).toMatch(/ 1x, .* 2x$/);
});

test("fonts", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/routing");
	await expect(page.locator('link[rel="preload"][as="font"][href="/fonts/inter/latin.woff2"]')).toHaveCount(1);
	await expect(page.locator('link[rel="preload"][as="font"][href="/fonts/mono.woff2"]')).toHaveCount(1);
	await page.evaluate(() => document.fonts.ready);
	expect(await page.evaluate(() => document.fonts.check('16px "Inter"'))).toBe(true);
	expect(await page.evaluate(() => document.fonts.check('16px "Docs Mono"'))).toBe(true);
});

test("head full", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/caching");
	await expect(page).toHaveTitle("Caching — Flare docs");
	const head = page.locator("head");
	await expect(head.locator('meta[name="description"]')).toHaveAttribute("content", /^One mode per page/);
	await expect(head.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://flare.test/docs/caching");
	await expect(head.locator('link[rel="alternate"][hreflang="hr"]')).toHaveAttribute("href", "https://flare.test/hr");
	await expect(head.locator('script[type="application/ld+json"]')).toHaveCount(1);
	await expect(head.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "Flare");
	await expect(head.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
	await expect(head.locator('link[rel="icon"][sizes="192x192"]')).toHaveCount(1);
	await expect(head.locator('meta[name="robots"]')).toHaveAttribute(
		"content",
		"index, follow, max-image-preview:large",
	);
	await expect(head.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
	await expect(head.locator('meta[name="theme-color"]')).toHaveCount(1);
	expect(await page.evaluate(() => Reflect.get(window, "__docsHeadScript"))).toBe(true);
	await page.locator("#sidebar").getByRole("link", { name: "Auth" }).click();
	await expect(page).toHaveTitle("Auth — Flare docs");
	await expect(head.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://flare.test/docs/auth");
});

test("sitemap", async ({ request, docs }, info) => {
	prodOnly(info);
	const body = await (await request.get(`${docs.origin}/sitemap.xml`)).text();
	expect(body).toContain("<loc>https://flare.test/docs/routing</loc>");
	expect(body).toContain("<loc>https://flare.test/search</loc>");
	// Every other locale of a page whose only param is the optional locale is listed too (B101).
	expect(body).toContain("<loc>https://flare.test/hr/search</loc>");
	expect(body).not.toContain("/admin");
	expect(body).not.toContain("/login");
	expect(body).toContain(
		"<url><loc>https://flare.test/</loc><changefreq>weekly</changefreq><priority>1</priority></url>",
	);
});

test("robots", async ({ request, docs }, info) => {
	prodOnly(info);
	const body = await (await request.get(`${docs.origin}/robots.txt`)).text();
	expect(body).toBe("User-agent: *\nDisallow: /admin\nSitemap: https://flare.test/sitemap.xml\n");
});

test("tailwind critical", async ({ page, request, docs }, info) => {
	prodOnly(info);
	const body = await (await request.get(`${docs.origin}/playground`)).text();
	expect(body).toMatch(/<style id="flare-critical"[^>]*>[^<]*\.mx-auto/);
	expect(body).toMatch(/<link id="flare-stylesheet" rel="preload" as="style" href="\/assets\/style-[^"]+\.css"/);
	await open(page, docs.origin, "/playground");
	await expect(page.locator('link[rel="stylesheet"][href^="/assets/style-"]')).toHaveCount(1);
});

// The stylesheet markup follows the critical style, so a dark rule the critical subset lacks still wins once the
// sheet loads: the shell's header and a streamed release card compute colors unlike the light theme's (B103, B57).
test("stylesheet after critical", async ({ browser, request, docs }, info) => {
	prodOnly(info);
	const body = await (await request.get(`${docs.origin}/changelog`)).text();
	const critical = body.indexOf('<style id="flare-critical"');
	expect(critical).toBeGreaterThan(-1);
	expect(critical).toBeLessThan(body.indexOf('<link id="flare-stylesheet"'));
	expect(critical).toBeLessThan(body.indexOf("<noscript><link"));
	const colors = async (theme: string) => {
		const context = await browser.newContext();
		try {
			await context.addInitScript((value) => localStorage.setItem("flare.theme", value), theme);
			const page = await context.newPage();
			await open(page, docs.origin, "/changelog");
			await expect(page.locator('link[rel="stylesheet"][href^="/assets/style-"]')).toHaveCount(1);
			await expect(page.locator("#releases li").first()).toBeVisible();
			const header = await page.locator("#nav").evaluate((element) => getComputedStyle(element).backgroundColor);
			const card = await page
				.locator("#releases li")
				.first()
				.evaluate((element) => getComputedStyle(element).borderTopColor);
			return { header, card };
		} finally {
			await context.close();
		}
	};
	const [dark, light] = [await colors("dark"), await colors("light")];
	expect(dark.header).not.toBe(light.header);
	expect(dark.card).not.toBe(light.card);
});

// No element inside a named view-transition group animates on a doc page reached by a card: Firefox drops frames when
// content inside an entering named element animates (dx/navigate.md, BUGS.md B61).
test("named content still", async ({ page, docs }) => {
	await open(page, docs.origin, "/");
	await page.locator("section.grid a").first().click();
	await expect(page.locator("#doc-title")).toBeVisible();
	await page.waitForLoadState("networkidle");
	const animated = await page.evaluate(() =>
		[...document.querySelectorAll('[style*="view-transition-name"] *')]
			.filter((element) => getComputedStyle(element).animationName !== "none")
			.map(
				(element) => `${element.tagName.toLowerCase()}.${element.className} ${getComputedStyle(element).animationName}`,
			),
	);
	expect(animated).toEqual([]);
});

test("css module", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/routing");
	const block = page.locator("[data-code-block]").first();
	expect(await block.getAttribute("class")).toMatch(/^_?block_[\w-]+$/);
	await expect(block).toHaveCSS("background-color", "rgb(18, 18, 26)");
});

test("reset", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/routing");
	await expect(page.locator("body")).toHaveCSS("margin", "0px");
	await expect(page.locator("h1").first()).toHaveCSS("font-weight", "600");
});
