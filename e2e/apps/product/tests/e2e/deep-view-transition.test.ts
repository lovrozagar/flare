import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test.describe("ViewTransitionCSS: SSR", () => {
	test("SSR HTML contains view-transition style", async ({ page }) => {
		const response = await page.request.get("/");
		const html = await response.text();
		expect(html).toContain("@view-transition{navigation:auto}");
		expect(html).toContain("animation-duration:175ms");
		expect(html).toContain("::view-transition-old(*)");
		expect(html).toContain("::view-transition-new(*)");
	});

	test("view-transition style has nonce in SSR", async ({ page }) => {
		const response = await page.request.get("/");
		const html = await response.text();
		const vtMatch = html.match(/<style[^>]*nonce="([^"]+)"[^>]*>[^<]*@view-transition/);
		expect(vtMatch).toBeTruthy();
		expect(vtMatch?.[1]?.length).toBeGreaterThan(0);
	});

	test("view-transition style on different pages", async ({ page }) => {
		for (const path of ["/about", "/users/42"]) {
			const response = await page.request.get(path);
			const html = await response.text();
			expect(html).toContain("@view-transition{navigation:auto}");
		}
	});
});

test.describe("ViewTransitionCSS: hydrated", () => {
	test("view-transition style in head after hydration", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/");
		const vtCss = await page.evaluate(() => {
			const styles = document.head.querySelectorAll("style");
			for (let i = 0; i < styles.length; i++) {
				const s = styles[i];
				if (s?.textContent?.includes("@view-transition")) return s.textContent;
			}
			return null;
		});
		expect(vtCss).toContain("animation-duration:175ms");
		cap.assertClean();
	});

	test("view-transition style survives SPA navigation", async ({ page }) => {
		await loadPage(page, "/");
		await navigateSPA(page, "/about");

		const vtCss = await page.evaluate(() => {
			const styles = document.head.querySelectorAll("style");
			for (let i = 0; i < styles.length; i++) {
				const s = styles[i];
				if (s?.textContent?.includes("@view-transition")) return s.textContent;
			}
			return null;
		});
		expect(vtCss).toBeTruthy();
	});
});

test.describe("startViewTransition: SPA", () => {
	test("navigate with viewTransition: true calls startViewTransition", async ({ page }) => {
		await loadPage(page, "/");

		const called = await page.evaluate(() => {
			return new Promise<boolean>((resolve) => {
				const doc = document as unknown as Record<string, unknown>;
				if (typeof doc.startViewTransition !== "function") {
					resolve(false);
					return;
				}

				const original = doc.startViewTransition as (...args: unknown[]) => unknown;
				doc.startViewTransition = (...args: unknown[]) => {
					resolve(true);
					return original.apply(document, args);
				};

				const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
					| ((to: string, opts?: Record<string, unknown>) => Promise<void>)
					| undefined;
				if (nav) {
					nav("/about", { viewTransition: true });
				} else {
					resolve(false);
				}
			});
		});

		expect(called).toBe(true);
	});

	test("navigate with viewTransition: false overrides default", async ({ page }) => {
		await loadPage(page, "/");

		const called = await page.evaluate(() => {
			return new Promise<boolean>((resolve) => {
				const doc = document as unknown as Record<string, unknown>;
				if (typeof doc.startViewTransition !== "function") {
					resolve(false);
					return;
				}

				let intercepted = false;
				const original = doc.startViewTransition as (...args: unknown[]) => unknown;
				doc.startViewTransition = (...args: unknown[]) => {
					intercepted = true;
					return original.apply(document, args);
				};

				const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
					| ((to: string, opts?: Record<string, unknown>) => Promise<void>)
					| undefined;
				if (nav) {
					nav("/about", { viewTransition: false }).then(() => resolve(intercepted));
				} else {
					resolve(false);
				}
			});
		});

		expect(called).toBe(false);
	});

	test("default SPA navigation uses router-level viewTransitions", async ({ page }) => {
		await loadPage(page, "/");

		const called = await page.evaluate(() => {
			return new Promise<boolean>((resolve) => {
				const doc = document as unknown as Record<string, unknown>;
				if (typeof doc.startViewTransition !== "function") {
					resolve(false);
					return;
				}

				const original = doc.startViewTransition as (...args: unknown[]) => unknown;
				doc.startViewTransition = (...args: unknown[]) => {
					resolve(true);
					return original.apply(document, args);
				};

				const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
					| ((to: string) => Promise<void>)
					| undefined;
				if (nav) {
					nav("/about");
				} else {
					resolve(false);
				}
			});
		});

		/* E2E app has viewTransitions: true, so default nav should trigger startViewTransition */
		expect(called).toBe(true);
	});

	test("navigate with viewTransition types passes types object", async ({ page }) => {
		await loadPage(page, "/");

		const result = await page.evaluate(() => {
			return new Promise<{ called: boolean; hasTypes: boolean; types: string[] }>((resolve) => {
				const doc = document as unknown as Record<string, unknown>;
				if (typeof doc.startViewTransition !== "function") {
					resolve({ called: false, hasTypes: false, types: [] });
					return;
				}

				const original = doc.startViewTransition as (...args: unknown[]) => unknown;
				doc.startViewTransition = (...args: unknown[]) => {
					const arg = args[0] as Record<string, unknown> | ((...a: unknown[]) => unknown);
					if (typeof arg === "object" && arg !== null && "types" in arg) {
						const updateFn = arg.update as () => void;
						if (updateFn) updateFn();
						resolve({
							called: true,
							hasTypes: true,
							types: arg.types as string[],
						});
						return {
							finished: Promise.resolve(),
							ready: Promise.resolve(),
							updateCallbackDone: Promise.resolve(),
						};
					}
					resolve({ called: true, hasTypes: false, types: [] });
					return original.apply(document, args);
				};

				const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
					| ((to: string, opts?: Record<string, unknown>) => Promise<void>)
					| undefined;
				if (nav) {
					nav("/about", { viewTransition: { types: ["slide-left"] } });
				} else {
					resolve({ called: false, hasTypes: false, types: [] });
				}
			});
		});

		expect(result.called).toBe(true);
		expect(result.hasTypes).toBe(true);
		expect(result.types).toEqual(["slide-left"]);
	});

	test("Link with viewTransition prop triggers startViewTransition on click", async ({ page }) => {
		await loadPage(page, "/link-test");

		const called = await page.evaluate(() => {
			return new Promise<boolean>((resolve) => {
				const doc = document as unknown as Record<string, unknown>;
				if (typeof doc.startViewTransition !== "function") {
					resolve(false);
					return;
				}

				const original = doc.startViewTransition as (...args: unknown[]) => unknown;
				doc.startViewTransition = (...args: unknown[]) => {
					resolve(true);
					return original.apply(document, args);
				};

				const link = document.querySelector("[data-testid='vt-link']") as HTMLAnchorElement | null;
				if (link) {
					link.click();
				} else {
					resolve(false);
				}
			});
		});

		expect(called).toBe(true);
	});
});
