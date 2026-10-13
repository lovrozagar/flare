import { documents, expect, open, test } from "./docs.fixture.ts";

// Every project (B94): each page of the docs route map answers its status, hydrates, and leaves the console empty.
// A document whose own status is not 200 logs that resource failure, and nothing else.
const PAGES: readonly { path: string; status: number }[] = [
	{ path: "/", status: 200 },
	{ path: "/hr", status: 200 },
	{ path: "/ar", status: 200 },
	{ path: "/docs/routing", status: 200 },
	{ path: "/docs/media", status: 200 },
	{ path: "/hr/docs/caching", status: 200 },
	{ path: "/api/server/create-server", status: 200 },
	{ path: "/examples", status: 200 },
	{ path: "/examples/a/b?tab=data", status: 200 },
	{ path: "/search?q=route", status: 200 },
	{ path: "/changelog", status: 200 },
	{ path: "/playground", status: 200 },
	{ path: "/login", status: 200 },
	{ path: "/[flare]", status: 200 },
	{ path: "/docs/zzz/qq", status: 404 },
	{ path: "/admin", status: 401 },
];

test.describe("every page hydrates", () => {
	for (const { path, status } of PAGES) {
		test(path, async ({ page, docs }) => {
			const statuses: number[] = [];
			page.on("response", (response) => {
				if (response.request().resourceType() === "document") statuses.push(response.status());
			});
			const problems = await open(page, docs.origin, path);
			// A changelog fill and the deferred values settle after hydrate.
			await page.waitForLoadState("networkidle");
			expect(statuses[0]).toBe(status);
			const own = `status of ${status}`;
			expect(problems.filter((problem) => status === 200 || !problem.includes(own))).toEqual([]);
		});
	}
});

test("click through", async ({ page, docs }) => {
	const problems = await open(page, docs.origin, "/");
	const loads = documents(page);
	await page.evaluate(() => Reflect.set(document.getElementById("nav") ?? {}, "docsMark", 1));
	await page.locator('[data-feature="routing"]').click();
	await expect(page.locator("#doc-title")).toHaveText("Routing");
	await page.locator("#sidebar").getByRole("link", { name: "Caching" }).click();
	await expect(page.locator("#doc-title")).toHaveText("Caching");
	await page.goBack();
	await expect(page.locator("#doc-title")).toHaveText("Routing");
	await page.goBack();
	await expect(page.locator("#message")).toHaveText("Hello");
	expect(loads).toEqual([]);
	expect(await page.evaluate(() => Reflect.get(document.getElementById("nav") ?? {}, "docsMark"))).toBe(1);
	expect(problems).toEqual([]);
});
