import { expect, type Page, test } from "@playwright/test";

const BROWSER_UA =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

test.use({ userAgent: BROWSER_UA });

async function gotoHydrated(page: Page, url: string): Promise<string[]> {
	const warnings: string[] = [];
	page.on("console", (m) => {
		const text = m.text();
		if (/hydration|mismatch/i.test(text.split("\n")[0] ?? "")) warnings.push(text);
	});
	await page.goto(url);
	await page.waitForSelector("html[data-flare-hydrated]", { timeout: 10_000 });
	return warnings;
}

test.describe("<ViewTransitionBoundary>", () => {
	test("renders no wrapper: <main> is the shell's direct child in SSR", async ({ request }) => {
		const html = await (await request.get("/vt-shell/a")).text();
		/* Solid may leave comment markers for the component insert; no element sits in between. */
		expect(html).toMatch(
			/<aside[^>]*data-testid="vt-sidebar"[\s\S]*?<\/aside>(?:<!--[^>]*-->)*<main[^>]*data-testid="vt-main"/,
		);
	});

	test("hydrates without mismatches, and content after it stays interactive", async ({ page }) => {
		const warnings = await gotoHydrated(page, "/vt-shell/a");
		await expect(page.getByTestId("vt-page")).toHaveText("Page A");
		await page.getByTestId("vt-after").click();
		await expect(page.getByTestId("vt-after")).toHaveText("clicks 1");
		expect(warnings).toEqual([]);
	});
});

test.describe("navigation scopes its view transition to the boundary", () => {
	/* Record the element (or document) each transition starts on, by data-testid. */
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			const w = window as unknown as { __vtTargets: string[] };
			w.__vtTargets = [];
			const proto = Element.prototype as unknown as { startViewTransition?: (...a: unknown[]) => unknown };
			const elementStart = proto.startViewTransition;
			if (elementStart) {
				proto.startViewTransition = function (this: Element, ...args: unknown[]) {
					w.__vtTargets.push(this.getAttribute("data-testid") ?? this.tagName);
					return elementStart.apply(this, args);
				};
			}
			const documentStart = document.startViewTransition?.bind(document);
			if (documentStart) {
				document.startViewTransition = ((...args: Parameters<typeof documentStart>) => {
					w.__vtTargets.push("document");
					return documentStart(...args);
				}) as typeof document.startViewTransition;
			}
		});
	});

	const targets = (page: Page) => page.evaluate(() => (window as unknown as { __vtTargets: string[] }).__vtTargets);
	const supportsScoped = (page: Page) =>
		page.evaluate(
			() => typeof (Element.prototype as { startViewTransition?: unknown }).startViewTransition === "function",
		);

	test("a → b runs on the shell's <main>", async ({ page }) => {
		await gotoHydrated(page, "/vt-shell/a");
		test.skip(!(await supportsScoped(page)), "no element-scoped view transitions in this browser");
		await page.getByTestId("vt-link-b").click();
		await expect(page.getByTestId("vt-page")).toHaveText("Page B");
		expect(await targets(page)).toEqual(["vt-main"]);
	});

	test("a param change keeps the shell mounted and scopes to <main>", async ({ page }) => {
		await gotoHydrated(page, "/vt-shell/1");
		test.skip(!(await supportsScoped(page)), "no element-scoped view transitions in this browser");
		await page.evaluate(() => {
			(document.querySelector('[data-testid="vt-shell"]') as HTMLElement & { __mark?: boolean }).__mark = true;
		});
		await page.getByTestId("vt-link-2").click();
		await expect(page.getByTestId("vt-page")).toHaveText("Item 2");
		const kept = await page.evaluate(
			() => (document.querySelector('[data-testid="vt-shell"]') as HTMLElement & { __mark?: boolean }).__mark === true,
		);
		expect(kept).toBe(true);
		expect(await targets(page)).toEqual(["vt-main"]);
	});

	test("leaving the shell, or scope: 'document', uses the document", async ({ page }) => {
		await gotoHydrated(page, "/vt-shell/a");
		await page.getByTestId("vt-link-doc").click();
		await expect(page.getByTestId("vt-page")).toHaveText("Page B");
		await page.getByTestId("vt-link-out").click();
		await expect(page.getByTestId("about-title")).toBeVisible();
		expect(await targets(page)).toEqual(["document", "document"]);
	});

	test("without element-scoped transitions the document transition still navigates", async ({ page }) => {
		await page.addInitScript(() => {
			delete (Element.prototype as { startViewTransition?: unknown }).startViewTransition;
		});
		await gotoHydrated(page, "/vt-shell/a");
		await page.getByTestId("vt-link-b").click();
		await expect(page.getByTestId("vt-page")).toHaveText("Page B");
		expect(await targets(page)).toEqual(["document"]);
	});

	test("the sidebar keeps :hover through a scoped transition", async ({ page }) => {
		await gotoHydrated(page, "/vt-shell/a");
		test.skip(!(await supportsScoped(page)), "no element-scoped view transitions in this browser");
		const link = page.getByTestId("vt-link-b");
		await link.hover();
		await expect(link).toHaveCSS("color", "rgb(255, 0, 0)");
		/* Sample the hovered link's color on every frame while the transition runs. */
		const colors = page.evaluate(
			() =>
				new Promise<string[]>((resolve) => {
					const a = document.querySelector('[data-testid="vt-link-b"]') as HTMLElement;
					const seen: string[] = [];
					const start = performance.now();
					const tick = () => {
						seen.push(getComputedStyle(a).color);
						if (performance.now() - start < 600) requestAnimationFrame(tick);
						else resolve(seen);
					};
					requestAnimationFrame(tick);
				}),
		);
		await link.click();
		await expect(page.getByTestId("vt-page")).toHaveText("Page B");
		expect(new Set(await colors)).toEqual(new Set(["rgb(255, 0, 0)"]));
	});

	test("a rapid second navigation lands on its own content without errors", async ({ page }) => {
		const errors: string[] = [];
		page.on("pageerror", (e) => errors.push(e.message));
		await gotoHydrated(page, "/vt-shell/a");
		await page.getByTestId("vt-link-b").click();
		await page.getByTestId("vt-link-1").click();
		await expect(page.getByTestId("vt-page")).toHaveText("Item 1");
		expect(errors).toEqual([]);
	});
});
