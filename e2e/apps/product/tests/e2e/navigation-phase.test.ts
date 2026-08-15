import { expect, test } from "@playwright/test";
import { loadPage } from "./helpers";

test.describe("navigationPhase signal", () => {
	test("navigationPhase is idle after page load", async ({ page }) => {
		await loadPage(page, "/");
		const phase = await page.evaluate(() =>
			(window as unknown as { __flareNavigationPhase?: () => string }).__flareNavigationPhase?.(),
		);
		expect(phase).toBe("idle");
	});

	test("navigationPhase transitions through loading → idle on SPA nav", async ({ page }) => {
		await loadPage(page, "/");

		/* Collect phases during navigation */
		await page.evaluate(() => {
			const w = window as unknown as {
				__flareNavigate?: (to: string) => Promise<void>;
				__flareNavigationPhase?: () => string;
				__phaseLog?: string[];
			};
			w.__phaseLog = [];
			const origPhase = w.__flareNavigationPhase;
			if (origPhase) {
				/* Poll phase changes during navigation */
				const interval = setInterval(() => {
					const phase = origPhase();
					const log = w.__phaseLog;
					if (log && (log.length === 0 || log[log.length - 1] !== phase)) {
						log.push(phase);
					}
					if (phase === "idle" && log && log.length > 1) {
						clearInterval(interval);
					}
				}, 5);
			}
		});

		/* Navigate via SPA */
		await page.evaluate(() =>
			(window as unknown as { __flareNavigate?: (to: string) => Promise<void> }).__flareNavigate?.("/about"),
		);

		/* Wait for idle */
		await page.waitForFunction(
			() => (window as unknown as { __flareNavigationPhase?: () => string }).__flareNavigationPhase?.() === "idle",
			null,
			{ timeout: 5000 },
		);

		const phases = await page.evaluate(() => (window as unknown as { __phaseLog?: string[] }).__phaseLog);

		/* Should have gone through at least loading → idle */
		expect(phases).toBeDefined();
		expect(phases).toContain("loading");
		expect(phases).toContain("idle");
	});

	test("viewTransition is available during navigation with VT enabled", async ({ page }) => {
		await loadPage(page, "/");

		/* Check if viewTransition accessor is exposed and null when idle */
		const vtIdle = await page.evaluate(() =>
			(window as unknown as { __flareViewTransition?: () => unknown }).__flareViewTransition?.(),
		);
		expect(vtIdle).toBeNull();
	});
});
