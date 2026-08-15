import { expect, test } from "@playwright/test";
import { loadPage, setupConsoleCapture } from "./helpers";

test.describe("External href", () => {
	test("renders <a> with correct href", async ({ page }) => {
		await loadPage(page, "/link-features");

		const link = page.locator("[data-testid=ext-plain]");
		const tag = await link.evaluate((el) => el.tagName.toLowerCase());
		expect(tag).toBe("a");
		await expect(link).toHaveAttribute("href", "https://example.com/page");
	});

	test("click does not trigger SPA navigation", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/link-features");

		/* Intercept navigation to prevent actual external nav */
		await page.evaluate(() => {
			window.addEventListener(
				"click",
				(e) => {
					const target = e.target as HTMLElement;
					if (target.closest("[data-testid=ext-plain]")) {
						e.preventDefault();
					}
				},
				true,
			);
		});

		const urlBefore = page.url();
		await page.click("[data-testid=ext-plain]");
		await page.waitForTimeout(300);

		/* Should still be on same page (click was prevented from leaving) */
		expect(page.url()).toContain("/link-features");
		cap.assertClean();
	});

	test("target=_blank auto-applies rel='noopener noreferrer'", async ({ page }) => {
		await loadPage(page, "/link-features");

		const link = page.locator("[data-testid=ext-blank]");
		await expect(link).toHaveAttribute("target", "_blank");
		await expect(link).toHaveAttribute("rel", "noopener noreferrer");
	});

	test("explicit rel preserved over auto rel", async ({ page }) => {
		await loadPage(page, "/link-features");

		const link = page.locator("[data-testid=ext-rel]");
		await expect(link).toHaveAttribute("target", "_blank");
		await expect(link).toHaveAttribute("rel", "sponsored");
	});

	test("disabled renders <span>", async ({ page }) => {
		await loadPage(page, "/link-features");

		const el = page.locator("[data-testid=ext-disabled]");
		const tag = await el.evaluate((el) => el.tagName.toLowerCase());
		expect(tag).toBe("span");
		await expect(el).toHaveAttribute("aria-disabled", "true");
	});

	test("javascript: href sanitized to #", async ({ page }) => {
		await loadPage(page, "/link-features");

		const link = page.locator("[data-testid=ext-xss]");
		await expect(link).toHaveAttribute("href", "#");
	});

	test("no prefetch on intent", async ({ page }) => {
		await loadPage(page, "/link-features");

		const ndjsonRequests: string[] = [];
		page.on("request", (req) => {
			if (req.headers()["x-d"] === "1") {
				ndjsonRequests.push(req.url());
			}
		});

		await page.hover("[data-testid=ext-plain]");
		await page.waitForTimeout(500);

		expect(ndjsonRequests.length).toBe(0);
	});
});

test.describe("Auto rel for target=_blank", () => {
	test("internal link + target=_blank → noopener noreferrer", async ({ page }) => {
		await loadPage(page, "/link-features");

		const link = page.locator("[data-testid=internal-blank]");
		await expect(link).toHaveAttribute("rel", "noopener noreferrer");
	});

	test("explicit rel wins over auto", async ({ page }) => {
		await loadPage(page, "/link-features");

		const link = page.locator("[data-testid=internal-rel]");
		await expect(link).toHaveAttribute("rel", "nofollow");
	});

	test("no target=_blank → no rel", async ({ page }) => {
		await loadPage(page, "/link-features");

		const link = page.locator("[data-testid=internal-no-blank]");
		const rel = await link.getAttribute("rel");
		expect(rel).toBeNull();
	});
});

test.describe("Native attr forwarding", () => {
	test("title, download, id, aria-label forwarded to <a>", async ({ page }) => {
		await loadPage(page, "/link-features");

		const link = page.locator("[data-testid=native-attrs]");
		await expect(link).toHaveAttribute("title", "About page");
		await expect(link).toHaveAttribute("download", "file.pdf");
		await expect(link).toHaveAttribute("id", "about-link");
		await expect(link).toHaveAttribute("aria-label", "Go to about");
	});
});

test.describe("activeProps / inactiveProps", () => {
	test("self link: activeProps class + activeClass applied", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/link-features");

		const self = page.locator("[data-testid=ap-self]");
		const cls = await self.getAttribute("class");
		expect(cls).toContain("font-bold");
		expect(cls).toContain("is-active");

		cap.assertClean();
	});

	test("self link: activeProps aria-selected applied", async ({ page }) => {
		await loadPage(page, "/link-features");

		const self = page.locator("[data-testid=ap-self]");
		await expect(self).toHaveAttribute("aria-selected", "true");
	});

	test("other link: inactiveProps class applied, activeProps not", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/link-features");

		const other = page.locator("[data-testid=ap-other]");
		const cls = await other.getAttribute("class");
		expect(cls).toContain("opacity-50");
		expect(cls).not.toContain("font-bold");

		cap.assertClean();
	});

	test("other link: no aria-selected when inactive", async ({ page }) => {
		await loadPage(page, "/link-features");

		const other = page.locator("[data-testid=ap-other]");
		const ariaSelected = await other.getAttribute("aria-selected");
		expect(ariaSelected).toBeNull();
	});

	test("activeProps style merged with base style", async ({ page }) => {
		await loadPage(page, "/link-features");

		const el = page.locator("[data-testid=ap-style]");
		const style = await el.getAttribute("style");
		expect(style).toContain("color");
		expect(style).toContain("font-weight");
	});
});
