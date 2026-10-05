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

test.describe("nested and misplaced boundaries", () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			const w = window as unknown as {
				__vtTargets: string[];
				__vtDurations: number[][];
				__vtMarked: boolean[];
			};
			w.__vtTargets = [];
			w.__vtDurations = [];
			w.__vtMarked = [];
			type Transition = { ready: Promise<void> };
			const proto = Element.prototype as unknown as { startViewTransition?: (...a: unknown[]) => Transition };
			const elementStart = proto.startViewTransition;
			if (elementStart) {
				proto.startViewTransition = function (this: Element, ...args: unknown[]) {
					w.__vtTargets.push(this.getAttribute("data-testid") ?? this.tagName);
					const transition = elementStart.apply(this, args);
					transition.ready
						.then(() => {
							w.__vtMarked.push(this.hasAttribute("data-flare-vt-scope"));
							/* The old/new snapshots: <ViewTransitionCSS> times those; the group keeps the UA default. */
							w.__vtDurations.push(
								this.getAnimations({ subtree: true })
									.filter((a) =>
										/view-transition-(old|new)/.test((a.effect as KeyframeEffect | null)?.pseudoElement ?? ""),
									)
									.map((a) => Number(a.effect?.getTiming().duration)),
							);
						})
						.catch(() => {});
					return transition;
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

	const read = <K extends "__vtTargets" | "__vtDurations" | "__vtMarked">(page: Page, key: K) =>
		page.evaluate((k) => (window as unknown as Record<string, unknown>)[k], key);
	const supportsScoped = (page: Page) =>
		page.evaluate(
			() => typeof (Element.prototype as { startViewTransition?: unknown }).startViewTransition === "function",
		);

	test("tab to tab scopes to the tab panel; leaving the tabs scopes to the shell", async ({ page }) => {
		await gotoHydrated(page, "/vt-tabbed/one");
		test.skip(!(await supportsScoped(page)), "no element-scoped view transitions in this browser");
		await page.getByTestId("vt-tab-two").click();
		await expect(page.getByTestId("vt-tab")).toHaveText("Tab two");
		await page.getByTestId("vt-link-a").click();
		await expect(page.getByTestId("vt-page")).toHaveText("Page A");
		expect(await read(page, "__vtTargets")).toEqual(["vt-tab-panel", "vt-main"]);
	});

	test("boundaries around a sidebar or inside the page are ignored", async ({ page }) => {
		await gotoHydrated(page, "/vt-misplaced/x");
		await page.getByTestId("vt-misplaced-y").click();
		await expect(page.getByTestId("vt-misplaced-page")).toHaveText("Page Y");
		expect(await read(page, "__vtTargets")).toEqual(["document"]);
	});

	test("@dev-only a boundary around no route content gets a dev warning", async ({ page }) => {
		const warnings: string[] = [];
		page.on("console", (m) => {
			if (m.text().includes("wraps no route content")) warnings.push(m.text());
		});
		await gotoHydrated(page, "/vt-misplaced/x");
		await page.getByTestId("vt-misplaced-y").click();
		await expect(page.getByTestId("vt-misplaced-page")).toHaveText("Page Y");
		await expect.poll(() => warnings.length).toBeGreaterThan(0);
	});

	test("@dev-only the chosen scope carries data-flare-vt-scope while it animates", async ({ page }) => {
		await gotoHydrated(page, "/vt-shell/a");
		test.skip(!(await supportsScoped(page)), "no element-scoped view transitions in this browser");
		await page.getByTestId("vt-link-b").click();
		await expect(page.getByTestId("vt-page")).toHaveText("Page B");
		await expect.poll(() => read(page, "__vtMarked")).toEqual([true]);
		await expect.poll(() => page.locator("[data-flare-vt-scope]").count()).toBe(0);
	});

	test("<ViewTransitionCSS> timing applies to the scoped transition", async ({ page }) => {
		await gotoHydrated(page, "/vt-shell/a");
		test.skip(!(await supportsScoped(page)), "no element-scoped view transitions in this browser");
		await page.getByTestId("vt-link-b").click();
		await expect(page.getByTestId("vt-page")).toHaveText("Page B");
		await expect.poll(() => read(page, "__vtDurations")).not.toEqual([]);
		const [durations] = (await read(page, "__vtDurations")) as number[][];
		expect(durations?.length).toBeGreaterThan(0);
		expect(new Set(durations)).toEqual(new Set([175]));
	});
});
