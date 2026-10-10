import { expect, test } from "@playwright/test";
import { loadPage } from "./helpers";

test.describe("devtools locale matcher @dev-only @node-only", () => {
	test("/__flare/api includes localeMatch from the router", async ({ request }) => {
		const res = await request.get("/__flare/api");
		expect(res.status()).toBe(200);
		const body = (await res.json()) as {
			localeMatch?: { locales: string[]; paramName: string };
		};
		expect(body.localeMatch).toEqual({
			locales: ["en", "hr", "fr"],
			paramName: "locale",
		});
	});

	test("Current tab on /about does not treat about as [locale]", async ({ page }) => {
		await loadPage(page, "/about");
		await page.keyboard.press("Control+Shift+D");
		await page.waitForFunction(() => {
			const root = document.getElementById("__flare-devtools-host")?.shadowRoot;
			return !!root?.querySelector(".cur-grid");
		});

		const snapshot = await page.evaluate(() => {
			const root = document.getElementById("__flare-devtools-host")?.shadowRoot;
			if (!root) return null;
			const params: Record<string, string> = {};
			const keys = [...root.querySelectorAll(".cur-param-key")];
			const vals = [...root.querySelectorAll(".cur-param-val")];
			for (let i = 0; i < keys.length; i++) {
				const key = keys[i]?.textContent ?? "";
				const val = vals[i]?.textContent ?? "";
				if (key) params[key] = val;
			}
			const virtual =
				[...root.querySelectorAll(".cur-path-row")]
					.find((row) => row.querySelector(".cur-path-label")?.textContent === "virtual")
					?.querySelector(".cur-path-value")?.textContent ?? "";
			const chain = [...root.querySelectorAll(".cur-chain-seg")].map((el) => el.textContent ?? "");
			return { chain, params, virtual };
		});

		expect(snapshot).not.toBeNull();
		expect(snapshot?.params.locale).not.toBe("about");
		expect(snapshot?.virtual).toBe("_root_/about");
		expect(snapshot?.chain.some((seg) => seg === "about")).toBe(true);
		expect(snapshot?.chain.some((seg) => seg === "[locale]")).toBe(false);
	});

	test("Current tab on /hr consumes locale from the allow-list", async ({ page }) => {
		await loadPage(page, "/hr");
		await page.keyboard.press("Control+Shift+D");
		await page.waitForFunction(() => {
			const root = document.getElementById("__flare-devtools-host")?.shadowRoot;
			return !!root?.querySelector(".cur-grid");
		});

		const snapshot = await page.evaluate(() => {
			const root = document.getElementById("__flare-devtools-host")?.shadowRoot;
			if (!root) return null;
			const params: Record<string, string> = {};
			const keys = [...root.querySelectorAll(".cur-param-key")];
			const vals = [...root.querySelectorAll(".cur-param-val")];
			for (let i = 0; i < keys.length; i++) {
				const key = keys[i]?.textContent ?? "";
				const val = vals[i]?.textContent ?? "";
				if (key) params[key] = val;
			}
			const chain = [...root.querySelectorAll(".cur-chain-seg")].map((el) => el.textContent ?? "");
			return { chain, params };
		});

		expect(snapshot?.params.locale).toBe("hr");
		expect(snapshot?.chain.some((seg) => seg === "[locale]")).toBe(true);
	});
});
