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
