import { readFileSync, writeFileSync } from "node:fs";
import { documents, expect, isProd, open, test } from "./docs.fixture.ts";

// Every project (B94): each page of the docs route map answers its status, hydrates, and leaves the console empty.
// A document whose own status is not 200 logs that resource failure, and nothing else. `logs` are the flare errors
// the page's server logs on purpose.
const PAGES: readonly { path: string; status: number; logs?: readonly string[] }[] = [
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
	{ path: "/changelog", status: 200, logs: ["The stats service is down"] },
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

// `public/` ships with the client and is served from it on every project (BUGS.md B11). An `.ico` is either of its
// registered types: Node's static layer says `image/x-icon`, the Workers assets binding `image/vnd.microsoft.icon`.
const PUBLIC: readonly { path: string; type: RegExp }[] = [
	{ path: "/favicon.ico", type: /^image\/(x-icon|vnd\.microsoft\.icon)/ },
	{ path: "/icon.svg", type: /^image\/svg\+xml/ },
	{ path: "/apple-touch-icon.png", type: /^image\/png/ },
	{ path: "/manifest.webmanifest", type: /^application\/manifest\+json/ },
	{ path: "/fonts/mono.woff2", type: /^font\/woff2/ },
];

test("public files", async ({ request, docs }) => {
	for (const { path, type } of PUBLIC) {
		const response = await request.get(`${docs.origin}${path}`);
		expect(response.status(), path).toBe(200);
		expect(response.headers()["content-type"], path).toMatch(type);
		expect((await response.body()).byteLength, path).toBeGreaterThan(0);
	}
});

// While every page of the route map loads, each in its own tab, the dev server logs no HTML it could not parse and no
// uncaught error, and its flare error lines are exactly the ones the pages declare (BUGS.md B8). Only the lines this
// test adds are read: the boot is shared with the other specs.
test("dev log clean", async ({ context, docs }, info) => {
	test.skip(isProd(info), "reads the dev server's log");
	// Every page in one test, each a cold dev compile the first time.
	test.setTimeout(120_000);
	const start = docs.logs().length;
	for (const { path } of PAGES) {
		const page = await context.newPage();
		await open(page, docs.origin, path);
		await page.waitForLoadState("networkidle");
		await page.close();
	}
	const lines = docs.logs().slice(start);
	expect(lines.filter((line) => /Unable to parse|uncaught|unhandled/i.test(line))).toEqual([]);
	const declared = PAGES.flatMap((entry) => entry.logs ?? []);
	const flare = lines.filter((line) => line.startsWith("[flare:"));
	// A line no page declares stays whole, so an extra one shows as itself.
	expect(flare.map((line) => declared.find((message) => line.includes(message)) ?? line)).toEqual(declared);
});

// Five main-nav links 30 ms apart. The first, Changelog, has landed with its 900 ms stats value still streaming (or
// filling, once the page is stored), so the next click aborts a body mid-stream. A superseded navigation resolves, its
// page keeps its fallbacks until the next commit, and the page reports no error (B58, B105).
test("rapid links", async ({ page, docs }) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(`${error.name}: ${error.message}\n${error.stack ?? ""}`));
	await open(page, docs.origin, "/docs/routing");
	// Clicked from the page, so no actionability wait stretches the 30 ms.
	const streaming = await page.evaluate(
		async ({ nav, paths }) => {
			const link = (path: string) =>
				[...document.querySelectorAll<HTMLAnchorElement>(nav)].find((item) => item.pathname === path);
			link("/changelog")?.click();
			while (document.querySelector("main h1")?.textContent !== "Changelog") {
				await new Promise((resolve) => requestAnimationFrame(resolve));
			}
			const pending = document.querySelector("#stats-loading") !== null;
			for (const path of paths) {
				link(path)?.click();
				await new Promise((resolve) => setTimeout(resolve, 30));
			}
			return pending;
		},
		{ nav: "#nav nav a", paths: ["/api/server/create-server", "/examples", "/playground", "/docs/routing"] },
	);
	expect(streaming).toBe(true);
	await expect(page.locator("#doc-title")).toHaveText("Routing");
	await page.waitForTimeout(500);
	expect(errors).toEqual([]);
});

// A dev hard load is styled before any client module runs: with every script blocked, Vite's client and the app's
// entry included, the server's own dev styles already style the first paint (B104, BUGS.md B59).
test("dev first paint", async ({ page, docs }, info) => {
	test.skip(isProd(info), "dev styles");
	await page.route("**/*", (route) => (route.request().resourceType() === "script" ? route.abort() : route.continue()));
	await page.goto(`${docs.origin}/docs/routing`, { waitUntil: "domcontentloaded" });
	await expect(page.locator("body")).toHaveCSS("margin", "0px");
	await expect(page.locator("h1").first()).toHaveCSS("font-weight", "600");
	await expect(page.locator("#nav")).toHaveCSS("position", "sticky");
});

// The client adopts the server's dev styles: one style per module id after hydration, and still one after an HMR
// edit of the app's CSS, with the new rule applied (B104).
test("dev styles adopted", async ({ page, docs }, info) => {
	test.skip(isProd(info), "dev styles");
	const ids = () =>
		page.evaluate(() =>
			[...document.querySelectorAll("style[data-vite-dev-id]")].map(
				(style) => style.getAttribute("data-vite-dev-id") ?? "",
			),
		);
	await open(page, docs.origin, "/docs/routing");
	const first = await ids();
	expect(first.some((id) => id.endsWith("/src/styles.css"))).toBe(true);
	// Tailwind's entry comes out compiled: a generated utility's rule is in it, not the `@import` source.
	const tailwind = await page.evaluate(
		() => document.querySelector<HTMLStyleElement>('style[data-vite-dev-id$="/src/styles.css"]')?.textContent ?? "",
	);
	expect(tailwind).toMatch(/\.mx-auto\s*\{/);
	expect(tailwind).not.toContain('@import "tailwindcss"');
	expect(new Set(first).size).toBe(first.length);
	const file = `${docs.appDir}/src/styles.css`;
	const source = readFileSync(file, "utf8");
	try {
		writeFileSync(file, `${source}\n.b59-hmr-probe { color: rgb(1, 2, 3); }\n`);
		await page.evaluate(() => {
			const probe = document.createElement("p");
			probe.className = "b59-hmr-probe";
			probe.id = "b59-probe";
			document.body.append(probe);
		});
		await expect(page.locator("#b59-probe")).toHaveCSS("color", "rgb(1, 2, 3)");
		const after = await ids();
		expect(after.filter((id) => id.endsWith("/src/styles.css"))).toHaveLength(1);
		expect(new Set(after).size).toBe(after.length);
	} finally {
		writeFileSync(file, source);
	}
});
