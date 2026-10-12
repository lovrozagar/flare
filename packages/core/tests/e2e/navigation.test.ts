import { expect, test, type Page } from "@playwright/test";
import { boot, type Boot } from "./boot.ts";

// Client navigation on the minimal app's real dev path (B70): flare() serves src/server.ts and the client hydrates.

let session: Boot;

test.beforeAll(async ({ browserName }, workerInfo) => {
	const name = workerInfo.project.name ?? `node-dev-${browserName}`;
	const [runtime, mode] = name.split("-");
	session = await boot({ app: "minimal", runtime: runtime ?? "node", mode: mode ?? "dev" });
});

test.afterAll(async () => {
	await session.close();
});

// A page error fails the test: a hydration mismatch halts Solid without changing the text.
async function open(page: Page, path: string): Promise<string[]> {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(`${session.origin}${path}`);
	await expect(page.locator("html")).toHaveAttribute("data-flare-hydrated", "");
	return errors;
}

test("click", async ({ page }) => {
	const documents: string[] = [];
	page.on("request", (request) => {
		if (request.resourceType() === "document") documents.push(request.url());
	});
	const errors = await open(page, "/");
	await page.evaluate(() => Reflect.set(document.getElementById("nav") ?? {}, "flareMark", 1));
	await page.getByRole("link", { name: "About" }).click();
	await expect(page).toHaveURL(`${session.origin}/about`);
	await expect(page.locator("#app")).toHaveText("About");
	expect(await page.evaluate(() => Reflect.get(document.getElementById("nav") ?? {}, "flareMark"))).toBe(1);
	await expect(page.getByRole("link", { name: "About" })).toHaveAttribute("aria-current", "page");
	expect(documents).toEqual([`${session.origin}/`]);
	expect(errors).toEqual([]);
});

test("back", async ({ page }) => {
	const errors = await open(page, "/");
	await page.getByRole("link", { name: "About" }).click();
	await expect(page.locator("#app")).toHaveText("About");
	await page.goBack();
	await expect(page).toHaveURL(`${session.origin}/`);
	await expect(page.locator("#app")).toHaveText("Home");
	expect(errors).toEqual([]);
});

test("scroll", async ({ page }) => {
	const errors = await open(page, "/");
	await page.evaluate(() => window.scrollTo(0, 1500));
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1500);
	await page.getByRole("link", { name: "About" }).click();
	await expect(page.locator("#app")).toHaveText("About");
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
	await page.goBack();
	await expect(page.locator("#app")).toHaveText("Home");
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1500);
	expect(errors).toEqual([]);
});

test("two skeletons", async ({ page }) => {
	const response = await fetch(`${session.origin}/skeletons`);
	expect(response.status).toBe(200);
	const reader = response.body?.getReader();
	if (reader === undefined) throw new Error("body");
	const decoder = new TextDecoder();
	const chunks: string[] = [];
	for (let step = await reader.read(); !step.done; step = await reader.read()) {
		chunks.push(decoder.decode(step.value, { stream: true }));
	}
	const first = chunks[0] ?? "";
	expect(first).toContain("wait-fast");
	expect(first).toContain("wait-slow");
	expect(first).not.toContain("FAST");
	expect(first).not.toContain("SLOW");
	const fastAt = chunks.findIndex((chunk) => chunk.includes("FAST"));
	const slowAt = chunks.findIndex((chunk) => chunk.includes("SLOW"));
	expect(fastAt).toBeGreaterThan(0);
	expect(slowAt).toBeGreaterThan(fastAt);
	const errors = await open(page, "/skeletons");
	await expect(page.locator("#fast")).toHaveText("FAST");
	await expect(page.locator("#slow")).toHaveText("SLOW");
	expect(errors).toEqual([]);
});
