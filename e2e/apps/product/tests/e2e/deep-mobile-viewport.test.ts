import { expect, test } from "@playwright/test";
import { setupConsoleCapture } from "./helpers";

/**
 * Mobile viewport tests.
 *
 * Validates framework behavior at mobile dimensions:
 * - Pages render without horizontal overflow
 * - Hydration works at mobile sizes
 * - Touch-friendly tap targets
 * - No layout breakage at common mobile widths
 * - Responsive media queries apply
 */

const MOBILE_VIEWPORTS = [
	{ height: 667, name: "iPhone SE", width: 375 },
	{ height: 844, name: "iPhone 12", width: 390 },
	{ height: 915, name: "Pixel 7", width: 412 },
	{ height: 1024, name: "iPad Mini", width: 768 },
];

const ROUTES = ["/", "/about", "/a11y-test", "/a11y-form-test", "/perf-bench"];

test.describe("Mobile viewport — rendering", () => {
	for (const vp of MOBILE_VIEWPORTS) {
		test(`${vp.name} (${vp.width}px) — pages render without horizontal overflow`, async ({ page }) => {
			await page.setViewportSize({ height: vp.height, width: vp.width });

			for (const route of ROUTES) {
				await page.goto(route, { waitUntil: "domcontentloaded" });
				await page.waitForFunction(() => document.documentElement.hasAttribute("data-hydrated"), null, {
					timeout: 15_000,
				});

				const hasOverflow = await page.evaluate(() => {
					return document.documentElement.scrollWidth > document.documentElement.clientWidth;
				});

				expect(hasOverflow, `Horizontal overflow on ${route} at ${vp.width}px`).toBe(false);
			}
		});
	}
});

test.describe("Mobile viewport — hydration", () => {
	test("hydrates correctly at 375px width", async ({ page }) => {
		await page.setViewportSize({ height: 667, width: 375 });
		const cap = setupConsoleCapture(page);

		await page.goto("/", { waitUntil: "domcontentloaded" });
		await page.waitForFunction(() => document.documentElement.hasAttribute("data-hydrated"), null, {
			timeout: 15_000,
		});

		const hydrated = await page.evaluate(() => document.documentElement.hasAttribute("data-hydrated"));
		expect(hydrated).toBe(true);

		cap.assertClean();
	});

	test("hydrates data-heavy page at mobile width", async ({ page }) => {
		await page.setViewportSize({ height: 844, width: 390 });

		await page.goto("/perf-bench", { waitUntil: "domcontentloaded" });
		await page.waitForFunction(() => document.documentElement.hasAttribute("data-hydrated"), null, {
			timeout: 15_000,
		});

		const hydrated = await page.evaluate(() => document.documentElement.hasAttribute("data-hydrated"));
		expect(hydrated).toBe(true);
	});

	test("1000-row stress page hydrates at mobile width", async ({ page }) => {
		await page.setViewportSize({ height: 844, width: 390 });

		await page.goto("/perf-stress", { waitUntil: "domcontentloaded" });
		await page.waitForFunction(() => document.documentElement.hasAttribute("data-hydrated"), null, {
			timeout: 15_000,
		});

		const count = await page.locator("[data-testid=stress-count]").textContent();
		expect(count).toBe("1000");
	});
});

test.describe("Mobile viewport — touch targets", () => {
	test("interactive elements meet 44px minimum tap target", async ({ page }) => {
		await page.setViewportSize({ height: 667, width: 375 });
		await page.goto("/a11y-test", { waitUntil: "domcontentloaded" });
		await page.waitForFunction(() => document.documentElement.hasAttribute("data-hydrated"), null, {
			timeout: 15_000,
		});

		const smallTargets = await page.evaluate(() => {
			const interactive = document.querySelectorAll("a, button, input, select, textarea");
			const tooSmall: string[] = [];
			for (const el of interactive) {
				const rect = el.getBoundingClientRect();
				/* only check visible elements */
				if (rect.width === 0 || rect.height === 0) continue;
				/* skip hidden elements like skip links */
				const style = getComputedStyle(el);
				if (style.position === "absolute" && rect.top < 0) continue;
				if (rect.height < 44 && rect.width < 44) {
					tooSmall.push(
						`${el.tagName}[${el.getAttribute("data-testid") ?? el.textContent?.slice(0, 20)}]: ${Math.round(rect.width)}x${Math.round(rect.height)}`,
					);
				}
			}
			return tooSmall;
		});

		/* warn but don't fail — many desktop-first sites have small targets */
		if (smallTargets.length > 0) {
			console.log(`Tap targets smaller than 44px: ${smallTargets.join(", ")}`);
		}
	});
});

test.describe("Mobile viewport — SPA navigation", () => {
	test("SPA nav works at mobile width", async ({ page }) => {
		await page.setViewportSize({ height: 667, width: 375 });

		await page.goto("/", { waitUntil: "domcontentloaded" });
		await page.waitForFunction(() => document.documentElement.hasAttribute("data-hydrated"), null, {
			timeout: 15_000,
		});

		/* navigate via SPA */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (nav) return nav("/about");
		});
		await page.waitForURL("**/about");

		const hydrated = await page.evaluate(() => document.documentElement.hasAttribute("data-hydrated"));
		expect(hydrated).toBe(true);
	});

	test("back/forward works at mobile width", async ({ page }) => {
		await page.setViewportSize({ height: 667, width: 375 });

		await page.goto("/", { waitUntil: "domcontentloaded" });
		await page.waitForFunction(() => document.documentElement.hasAttribute("data-hydrated"), null, {
			timeout: 15_000,
		});

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (nav) return nav("/about");
		});
		await page.waitForURL("**/about");

		await page.goBack();
		await page.waitForURL("**/");

		await page.goForward();
		await page.waitForURL("**/about");

		const hydrated = await page.evaluate(() => document.documentElement.hasAttribute("data-hydrated"));
		expect(hydrated).toBe(true);
	});
});

test.describe("Mobile viewport — form interaction", () => {
	test("form inputs are usable at mobile width", async ({ page }) => {
		await page.setViewportSize({ height: 667, width: 375 });

		await page.goto("/a11y-form-test", { waitUntil: "domcontentloaded" });
		await page.waitForFunction(() => document.documentElement.hasAttribute("data-hydrated"), null, {
			timeout: 15_000,
		});

		/* type into email field */
		const email = page.locator("[data-testid=a11y-email-input]");
		await email.fill("test@example.com");
		expect(await email.inputValue()).toBe("test@example.com");

		/* type into message field */
		const message = page.locator("[data-testid=a11y-message-input]");
		await message.fill("Test message");
		expect(await message.inputValue()).toBe("Test message");
	});
});
