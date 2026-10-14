import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { artifactPath } from "../../src/shared/cache/artifact-path.ts";
import { boot, type Boot } from "./boot.ts";

// SSG in a real runtime (bits/12): a production build prerenders /static and its two slugs, and the server reads each
// seed through its `static` store, files of the client output on Node and Bun and the ASSETS binding on Workers.
let session: Boot;
let mode = "dev";

test.beforeAll(async ({ browserName }, workerInfo) => {
	const name = workerInfo.project.name ?? `node-dev-${browserName}`;
	const [runtime, projectMode] = name.split("-");
	mode = projectMode ?? "dev";
	session = await boot({ app: "minimal", runtime: runtime ?? "node", mode });
});

test.afterAll(async () => {
	await session.close();
});

// The page hydrates, and the console holds no error or warning.
async function hydrated(page: Page, path: string): Promise<string[]> {
	const errors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
	});
	page.on("pageerror", (error) => void errors.push(String(error)));
	await page.goto(`${session.origin}${path}`);
	await expect(page.locator("html")).toHaveAttribute("data-flare-hydrated", "");
	return errors;
}

const SEEDED = [
	{ path: "/static", text: "static page", html: /id="static">static page</, tail: "_root_/static" },
	// Solid's markers sit around the slug in the HTML. The page shows `static a`.
	{ path: "/static/a", text: "static a", html: /id="static">static (<!--\$-->)?a/, tail: "_root_/static/[slug]:a" },
];

test("ssg served", async ({ page }) => {
	test.skip(mode !== "prod", "a seed exists only in a production build");
	for (const seeded of SEEDED) {
		const response = await fetch(`${session.origin}${seeded.path}`);
		const body = await response.text();
		expect(response.status).toBe(200);
		expect(response.headers.get("flare-render")).toBe("ssg");
		expect(body).toMatch(seeded.html);
		const nonce = /'nonce-([^']+)'/.exec(response.headers.get("content-security-policy") ?? "")?.[1] ?? "";
		expect(nonce).not.toBe("");
		expect(body).toContain(`nonce="${nonce}"`);
		const build = response.headers.get("flare-build") ?? "";
		const path = (await artifactPath(`static:${build}:${seeded.tail}`, { build })) ?? "";
		expect(existsSync(join(session.outDir ?? "", "client", path))).toBe(true);
		expect(await hydrated(page, seeded.path)).toEqual([]);
		await expect(page.locator("#static")).toHaveText(seeded.text);
	}
});

// A slug `params()` does not list is the router's 404, and no seed answers it.
test("ssg unlisted", async () => {
	test.skip(mode !== "prod", "a seed exists only in a production build");
	const response = await fetch(`${session.origin}/static/zzz`);
	expect(response.status).toBe(404);
	expect(response.headers.get("flare-render")).not.toBe("ssg");
});

// `vite dev` prerenders nothing: the page renders live.
test("ssg dev", async () => {
	test.skip(mode !== "dev", "dev renders live");
	const response = await fetch(`${session.origin}/static/a`);
	expect(response.status).toBe(200);
	expect(response.headers.get("flare-render")).not.toBe("ssg");
	expect(await response.text()).toMatch(/id="static">static (<!--\$-->)?a/);
});
